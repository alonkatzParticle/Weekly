/**
 * DB abstraction: SQLite locally (no POSTGRES_URL set), Vercel Postgres in production.
 * API keys/tokens are NEVER stored here — they live in environment variables.
 */

const isPostgres = !!process.env.POSTGRES_URL

// ─── SQLite (local dev) ───────────────────────────────────────────────────────

let _sqlite: any = null

function getSqlite() {
  if (_sqlite) return _sqlite
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3')
  _sqlite = new Database('weekly-report.db')
  return _sqlite
}

function sqliteInit() {
  const db = getSqlite()
  db.exec(`
    CREATE TABLE IF NOT EXISTS team_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      monday_user_id TEXT,
      is_video_team INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS ai_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER REFERENCES team_members(id),
      week_ending TEXT NOT NULL,
      summary_type TEXT NOT NULL,
      content TEXT NOT NULL,
      tasks_hash TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(member_id, week_ending, summary_type)
    );
    CREATE TABLE IF NOT EXISTS team_ai_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_ending TEXT NOT NULL,
      summary_type TEXT NOT NULL,
      content TEXT NOT NULL,
      tasks_hash TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(week_ending, summary_type)
    );
    CREATE TABLE IF NOT EXISTS board_ids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board_id TEXT NOT NULL UNIQUE,
      board_name TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS board_cache (
      board_id TEXT PRIMARY KEY,
      board_name TEXT NOT NULL,
      items TEXT NOT NULL,
      status_colors TEXT NOT NULL DEFAULT '{}',
      fetched_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cache_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `)
  // Migration: add tasks_hash to existing tables if not present
  try { db.exec(`ALTER TABLE ai_summaries ADD COLUMN tasks_hash TEXT`) } catch {}
  try { db.exec(`ALTER TABLE team_ai_summaries ADD COLUMN tasks_hash TEXT`) } catch {}
}

// ─── Board cache (SQLite only) ────────────────────────────────────────────────

export function saveBoardCacheSync(boardId: string, data: { name: string; items: any[]; statusColors: Record<string, string>; fetchedAt: number }) {
  if (isPostgres) return
  try {
    getSqlite().prepare(`
      INSERT INTO board_cache (board_id, board_name, items, status_colors, fetched_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(board_id) DO UPDATE SET
        board_name = excluded.board_name,
        items = excluded.items,
        status_colors = excluded.status_colors,
        fetched_at = excluded.fetched_at
    `).run(boardId, data.name, JSON.stringify(data.items), JSON.stringify(data.statusColors), data.fetchedAt)
  } catch (e) {
    console.error('[db] saveBoardCacheSync error:', e)
  }
}

export function loadBoardCacheFromDbSync(boardId: string): { name: string; items: any[]; statusColors: Record<string, string>; fetchedAt: number } | null {
  if (isPostgres) return null
  try {
    const row = getSqlite().prepare('SELECT * FROM board_cache WHERE board_id = ?').get(boardId) as any
    if (!row) return null
    return {
      name: row.board_name,
      items: JSON.parse(row.items),
      statusColors: JSON.parse(row.status_colors),
      fetchedAt: row.fetched_at,
    }
  } catch { return null }
}

export function loadAllBoardCachesSync(): Array<{ boardId: string; name: string; items: any[]; statusColors: Record<string, string>; fetchedAt: number }> {
  if (isPostgres) return []
  try {
    const rows = getSqlite().prepare('SELECT * FROM board_cache').all() as any[]
    return rows.map(r => ({
      boardId: r.board_id,
      name: r.board_name,
      items: JSON.parse(r.items),
      statusColors: JSON.parse(r.status_colors),
      fetchedAt: r.fetched_at,
    }))
  } catch { return [] }
}

export function getCacheMetaSync(key: string): string | null {
  if (isPostgres) return null
  try {
    const row = getSqlite().prepare('SELECT value FROM cache_meta WHERE key = ?').get(key) as any
    return row?.value ?? null
  } catch { return null }
}

export function setCacheMetaSync(key: string, value: string) {
  if (isPostgres) return
  try {
    getSqlite().prepare(`
      INSERT INTO cache_meta (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `).run(key, value)
  } catch (e) {
    console.error('[db] setCacheMetaSync error:', e)
  }
}

// ─── Postgres (Vercel production) ─────────────────────────────────────────────

async function pgInit() {
  const { sql } = await import('@vercel/postgres')
  await sql`CREATE TABLE IF NOT EXISTS team_members (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    monday_user_id VARCHAR(255),
    is_video_team BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
  )`
  await sql`CREATE TABLE IF NOT EXISTS ai_summaries (
    id SERIAL PRIMARY KEY,
    member_id INTEGER REFERENCES team_members(id),
    week_ending DATE NOT NULL,
    summary_type VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    tasks_hash VARCHAR(64),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(member_id, week_ending, summary_type)
  )`
  await sql`CREATE TABLE IF NOT EXISTS team_ai_summaries (
    id SERIAL PRIMARY KEY,
    week_ending DATE NOT NULL,
    summary_type VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    tasks_hash VARCHAR(64),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(week_ending, summary_type)
  )`
  await sql`CREATE TABLE IF NOT EXISTS board_ids (
    id SERIAL PRIMARY KEY,
    board_id VARCHAR(255) NOT NULL UNIQUE,
    board_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
  )`
  // Migration: add tasks_hash to existing tables if not present
  await sql`ALTER TABLE ai_summaries ADD COLUMN IF NOT EXISTS tasks_hash VARCHAR(64)`
  await sql`ALTER TABLE team_ai_summaries ADD COLUMN IF NOT EXISTS tasks_hash VARCHAR(64)`
}

// ─── Public API ───────────────────────────────────────────────────────────────

let initialized = false

export async function initDB() {
  if (initialized) return
  initialized = true
  if (isPostgres) {
    await pgInit()
  } else {
    sqliteInit()
  }
}

export async function getTeamMembers() {
  if (isPostgres) {
    const { sql } = await import('@vercel/postgres')
    const result = await sql`SELECT * FROM team_members ORDER BY name`
    return result.rows
  }
  const rows = getSqlite().prepare('SELECT * FROM team_members ORDER BY name').all() as any[]
  return rows.map((r: any) => ({ ...r, is_video_team: Boolean(r.is_video_team) }))
}

export async function upsertTeamMember(member: {
  id?: number
  name: string
  monday_user_id: string
  is_video_team: boolean
}) {
  if (isPostgres) {
    const { sql } = await import('@vercel/postgres')
    if (member.id) {
      await sql`UPDATE team_members SET name = ${member.name}, monday_user_id = ${member.monday_user_id}, is_video_team = ${member.is_video_team} WHERE id = ${member.id}`
    } else {
      await sql`INSERT INTO team_members (name, monday_user_id, is_video_team) VALUES (${member.name}, ${member.monday_user_id}, ${member.is_video_team})`
    }
    return
  }
  const db = getSqlite()
  if (member.id) {
    db.prepare('UPDATE team_members SET name = ?, monday_user_id = ?, is_video_team = ? WHERE id = ?')
      .run(member.name, member.monday_user_id, member.is_video_team ? 1 : 0, member.id)
  } else {
    db.prepare('INSERT INTO team_members (name, monday_user_id, is_video_team) VALUES (?, ?, ?)')
      .run(member.name, member.monday_user_id, member.is_video_team ? 1 : 0)
  }
}

export async function deleteTeamMember(id: number) {
  if (isPostgres) {
    const { sql } = await import('@vercel/postgres')
    await sql`DELETE FROM team_members WHERE id = ${id}`
    return
  }
  getSqlite().prepare('DELETE FROM team_members WHERE id = ?').run(id)
}

export async function getAISummary(memberId: number, weekEnding: string, type: string): Promise<{ content: string; tasks_hash: string | null } | null> {
  if (isPostgres) {
    const { sql } = await import('@vercel/postgres')
    const result = await sql`SELECT content, tasks_hash FROM ai_summaries WHERE member_id = ${memberId} AND week_ending = ${weekEnding} AND summary_type = ${type}`
    return result.rows[0] ? { content: result.rows[0].content, tasks_hash: result.rows[0].tasks_hash ?? null } : null
  }
  const row = getSqlite()
    .prepare('SELECT content, tasks_hash FROM ai_summaries WHERE member_id = ? AND week_ending = ? AND summary_type = ?')
    .get(memberId, weekEnding, type) as { content: string; tasks_hash: string | null } | undefined
  return row ?? null
}

export async function saveAISummary(memberId: number, weekEnding: string, type: string, content: string, tasksHash?: string) {
  if (isPostgres) {
    const { sql } = await import('@vercel/postgres')
    await sql`
      INSERT INTO ai_summaries (member_id, week_ending, summary_type, content, tasks_hash)
      VALUES (${memberId}, ${weekEnding}, ${type}, ${content}, ${tasksHash ?? null})
      ON CONFLICT (member_id, week_ending, summary_type) DO UPDATE SET content = ${content}, tasks_hash = ${tasksHash ?? null}, created_at = NOW()
    `
    return
  }
  getSqlite()
    .prepare('INSERT INTO ai_summaries (member_id, week_ending, summary_type, content, tasks_hash) VALUES (?, ?, ?, ?, ?) ON CONFLICT(member_id, week_ending, summary_type) DO UPDATE SET content = excluded.content, tasks_hash = excluded.tasks_hash')
    .run(memberId, weekEnding, type, content, tasksHash ?? null)
}

export async function getTeamAISummary(weekEnding: string, type: string): Promise<{ content: string; tasks_hash: string | null } | null> {
  if (isPostgres) {
    const { sql } = await import('@vercel/postgres')
    const result = await sql`SELECT content, tasks_hash FROM team_ai_summaries WHERE week_ending = ${weekEnding} AND summary_type = ${type}`
    return result.rows[0] ? { content: result.rows[0].content, tasks_hash: result.rows[0].tasks_hash ?? null } : null
  }
  const row = getSqlite()
    .prepare('SELECT content, tasks_hash FROM team_ai_summaries WHERE week_ending = ? AND summary_type = ?')
    .get(weekEnding, type) as { content: string; tasks_hash: string | null } | undefined
  return row ?? null
}

export async function saveTeamAISummary(weekEnding: string, type: string, content: string, tasksHash?: string) {
  if (isPostgres) {
    const { sql } = await import('@vercel/postgres')
    await sql`
      INSERT INTO team_ai_summaries (week_ending, summary_type, content, tasks_hash)
      VALUES (${weekEnding}, ${type}, ${content}, ${tasksHash ?? null})
      ON CONFLICT (week_ending, summary_type) DO UPDATE SET content = ${content}, tasks_hash = ${tasksHash ?? null}, created_at = NOW()
    `
    return
  }
  getSqlite()
    .prepare('INSERT INTO team_ai_summaries (week_ending, summary_type, content, tasks_hash) VALUES (?, ?, ?, ?) ON CONFLICT(week_ending, summary_type) DO UPDATE SET content = excluded.content, tasks_hash = excluded.tasks_hash')
    .run(weekEnding, type, content, tasksHash ?? null)
}

export async function getBoardIds() {
  if (isPostgres) {
    const { sql } = await import('@vercel/postgres')
    const result = await sql`SELECT * FROM board_ids ORDER BY board_name`
    return result.rows
  }
  return getSqlite().prepare('SELECT * FROM board_ids ORDER BY board_name').all()
}

export async function upsertBoardId(boardId: string, boardName: string) {
  if (isPostgres) {
    const { sql } = await import('@vercel/postgres')
    await sql`INSERT INTO board_ids (board_id, board_name) VALUES (${boardId}, ${boardName}) ON CONFLICT (board_id) DO UPDATE SET board_name = ${boardName}`
    return
  }
  getSqlite()
    .prepare('INSERT INTO board_ids (board_id, board_name) VALUES (?, ?) ON CONFLICT(board_id) DO UPDATE SET board_name = excluded.board_name')
    .run(boardId, boardName)
}

export async function deleteBoardId(boardId: string) {
  if (isPostgres) {
    const { sql } = await import('@vercel/postgres')
    await sql`DELETE FROM board_ids WHERE board_id = ${boardId}`
    return
  }
  getSqlite().prepare('DELETE FROM board_ids WHERE board_id = ?').run(boardId)
}

