import { saveBoardCache, loadAllBoardCacheEntries, loadBoardCacheEntry, getCacheMeta, setCacheMeta } from './db'

export interface DailyTask {
  id: string
  name: string
  board_name: string
  assignee_ids: string[]
  status: string
  status_color: string | null
  timeline_end: string | null
  monday_url: string | null
}

export const COMPLETED_STATUSES = ['approved', 'completed', 'done', 'for approval', 'sent to client', 'upload complete']

export interface MondayTask {
  id: string
  name: string
  board_name: string
  assignee_id: string
  timeline_start: string | null
  timeline_end: string | null
  priority: string
  status: string
  status_color: string | null
  monday_url: string | null
  dropbox_link: string | null
}

export interface TimeEntry {
  date: string
  hours: number
  week_ending: string
}

async function mondayQuery(query: string, token: string) {
  const response = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token,
      'Cache-Control': 'no-cache, no-store',
    },
    cache: 'no-store',
    body: JSON.stringify({ query }),
  })

  if (!response.ok) {
    throw new Error(`Monday.com API error: ${response.statusText}`)
  }

  const data = await response.json()
  if (data.errors) {
    throw new Error(`Monday.com GraphQL error: ${JSON.stringify(data.errors)}`)
  }

  return data.data
}

const EXCLUDED_GROUPS = ['form requests', 'ready for assignment']

// Board metadata cache: name + relevant column IDs. Very stable, cache for 1 hour.
interface BoardMeta {
  name: string
  timelineColId: string | null
  neededColumnIds: string[]
  // status label (lowercase) → Monday hex color, built from settings_str
  statusColors: Record<string, string>
  fetchedAt: number
}
const BOARD_META_TTL = 60 * 60 * 1000

// Board item cache: keyed by boardId. Items are fetched once and reused for any
// date/person query within the TTL. Selective columns keep the payload small.
interface BoardCache {
  name: string
  items: any[]
  statusColors: Record<string, string>
  fetchedAt: number
}
const BOARD_ITEM_TTL = 5 * 60 * 1000 // 5 minutes

// Use globalThis to persist caches across Next.js HMR reloads in dev mode
const g = globalThis as typeof globalThis & {
  _boardMetaCache?: Map<string, BoardMeta>
  _boardItemCache?: Map<string, BoardCache>
  _inflightFetches?: Map<string, Promise<BoardCache>>
}
const boardMetaCache: Map<string, BoardMeta> = g._boardMetaCache ?? (g._boardMetaCache = new Map())
const boardItemCache: Map<string, BoardCache> = g._boardItemCache ?? (g._boardItemCache = new Map())
const inflightFetches: Map<string, Promise<BoardCache>> = g._inflightFetches ?? (g._inflightFetches = new Map())

async function fetchBoardMeta(boardId: string, token: string): Promise<BoardMeta> {
  const cached = boardMetaCache.get(boardId)
  if (cached && Date.now() - cached.fetchedAt < BOARD_META_TTL) return cached

  const data = await mondayQuery(
    `query { boards(ids: [${boardId}]) { name columns { id type title settings_str } } }`,
    token
  )
  const board = data?.boards?.[0]
  if (!board?.name) return { name: '', timelineColId: null, neededColumnIds: [], statusColors: {}, fetchedAt: Date.now() }

  const cols: any[] = board.columns ?? []

  const timelineCol = cols.find((c: any) => c.type === 'timeline')
  // Person columns (all of them, needed for assignee check)
  const personCols = cols.filter((c: any) =>
    c.type === 'multiple-person' || c.type === 'people' || c.id === 'person' || c.id === 'people'
  )
  // Priority: status column with "priority" in ID or title
  const priorityCol = cols.find((c: any) =>
    c.type === 'status' && (c.id.toLowerCase().includes('priority') || c.title?.toLowerCase().includes('priority'))
  )
  // Status: status column with id "status" or title "status"
  const statusCol = cols.find((c: any) => c.type === 'status' && c.id === 'status')
    ?? cols.find((c: any) => c.type === 'status' && c.title?.toLowerCase() === 'status')
  // Link/Dropbox columns (link type or title includes dropbox)
  const dropboxCols = cols.filter((c: any) =>
    c.type === 'link' || c.title?.toLowerCase().includes('dropbox')
  )

  // Collect the specific column IDs we need — avoids fetching all 35+ columns per item
  const needed = new Set<string>()
  if (timelineCol) needed.add(timelineCol.id)
  personCols.forEach(c => needed.add(c.id))
  if (priorityCol) needed.add(priorityCol.id)
  if (statusCol) needed.add(statusCol.id)
  dropboxCols.forEach(c => needed.add(c.id))

  // Build status label → hex color map from the status column's settings_str
  const statusColors: Record<string, string> = {}
  const allStatusCols = cols.filter((c: any) => c.type === 'status')
  for (const col of allStatusCols) {
    try {
      const settings = JSON.parse(col.settings_str ?? '{}')
      const labels: Record<string, string> = settings.labels ?? {}
      const colors: Record<string, { color: string }> = settings.labels_colors ?? {}
      for (const [idx, label] of Object.entries(labels)) {
        if (colors[idx]?.color) statusColors[label.toLowerCase()] = colors[idx].color
      }
    } catch {}
  }

  const meta: BoardMeta = {
    name: board.name,
    timelineColId: timelineCol?.id ?? null,
    neededColumnIds: Array.from(needed),
    statusColors,
    fetchedAt: Date.now(),
  }
  boardMetaCache.set(boardId, meta)
  return meta
}

export function clearBoardCache() {
  boardMetaCache.clear()
  boardItemCache.clear()
  inflightFetches.clear()
}

async function fetchBoardItems(boardId: string, token: string, force = false): Promise<BoardCache> {
  if (!force) {
    // 1. Check in-memory cache
    const cached = boardItemCache.get(boardId)
    if (cached && Date.now() - cached.fetchedAt < BOARD_ITEM_TTL) return cached

    // 2. Fall back to DB before hitting Monday (covers cold start AND TTL expiry)
    const dbEntry = await loadBoardCacheEntry(boardId)
    if (dbEntry) {
      // Reset fetchedAt to now so the in-memory TTL starts fresh from this load
      const entry = { ...dbEntry, fetchedAt: Date.now() }
      boardItemCache.set(boardId, entry)
      return entry
    }
  }

  // Deduplicate concurrent in-flight requests for the same board (skip when force=true)
  if (!force) {
    const inflight = inflightFetches.get(boardId)
    if (inflight) return inflight
  }

  const promise = (async () => {
    try {
      const meta = await fetchBoardMeta(boardId, token)
      if (!meta.name) return { name: '', items: [], statusColors: {}, fetchedAt: Date.now() }

      // Only fetch the columns we actually need — reduces payload by ~5x vs all columns
      const colIdsArg = meta.neededColumnIds.length > 0
        ? `ids: [${meta.neededColumnIds.map(id => `"${id}"`).join(', ')}]`
        : ''
      const selectedCols = `column_values(${colIdsArg}) { id type text value }`
      const fields = `id name url group { title } ${selectedCols}`

      // Filter: only items that have a timeline set (skips items with no timeline)
      const queryParams = meta.timelineColId
        ? `query_params: { rules: [{ column_id: "${meta.timelineColId}", compare_value: [], operator: is_not_empty }] }`
        : ''

      const firstData = await mondayQuery(`
        query {
          boards(ids: [${boardId}]) {
            items_page(limit: 500, ${queryParams}) {
              cursor
              items { ${fields} }
            }
          }
        }
      `, token)

      const page = firstData?.boards?.[0]?.items_page
      let cursor: string | null = page?.cursor ?? null
      const items: any[] = [...(page?.items ?? [])]

      while (cursor) {
        const next = await mondayQuery(
          `query { next_items_page(limit: 500, cursor: "${cursor}") { cursor items { ${fields} } } }`,
          token
        )
        cursor = next?.next_items_page?.cursor ?? null
        items.push(...(next?.next_items_page?.items ?? []))
      }

      const result: BoardCache = { name: meta.name, items, statusColors: meta.statusColors, fetchedAt: Date.now() }
      boardItemCache.set(boardId, result)
      // Persist to DB + update last_synced (non-blocking)
      setImmediate(async () => {
        await saveBoardCache(boardId, result)
        await setCacheMeta('last_synced', new Date().toISOString())
      })
      return result
    } finally {
      inflightFetches.delete(boardId)
    }
  })()

  inflightFetches.set(boardId, promise)
  return promise
}

function processItem(item: any, boardName: string, mondayUserId: string, statusColors: Record<string, string> = {}): MondayTask | null {
  const groupTitle = item.group?.title?.toLowerCase() ?? ''
  if (EXCLUDED_GROUPS.some(g => groupTitle.includes(g))) return null

  const cols = item.column_values ?? []

  const personCols = cols.filter((c: any) =>
    c.type === 'multiple-person' || c.type === 'people' || c.id === 'person' || c.id === 'people'
  )
  const timelineCol = cols.find((c: any) => c.type === 'timeline' || c.id === 'timeline')
  const priorityCol = cols.find((c: any) => c.type === 'status' && (c.id.includes('priority') || c.id.includes('Priority')))
  const statusCol = cols.find((c: any) => c.type === 'status' && c.id === 'status')
    ?? cols.find((c: any) => c.type === 'status' && c.id.includes('status') && !c.id.toLowerCase().includes('priority'))
    ?? cols.find((c: any) => c.type === 'status' && !c.id.toLowerCase().includes('priority') && c.text && c.text !== '-')

  let isAssigned = false
  for (const personCol of personCols) {
    if (!personCol?.value) continue
    try {
      const personVal = JSON.parse(personCol.value)
      if (personVal?.personsAndTeams?.some((p: any) => String(p.id) === String(mondayUserId))) {
        isAssigned = true
        break
      }
    } catch {}
  }
  if (!isAssigned) return null

  let timelineStart = null
  let timelineEnd = null
  if (timelineCol?.value) {
    try {
      const tVal = JSON.parse(timelineCol.value)
      timelineStart = tVal?.from ?? null
      timelineEnd = tVal?.to ?? null
    } catch {}
  }

  let dropboxLink: string | null = null
  for (const c of cols) {
    try {
      if (c.value && c.value !== 'null') {
        const parsed = JSON.parse(c.value)
        const url = parsed?.url ?? (typeof parsed === 'string' ? parsed : null)
        if (url?.includes('dropbox.com')) { dropboxLink = url; break }
      }
    } catch {}
    if (c.text?.includes('dropbox.com')) { dropboxLink = c.text; break }
  }

  return {
    id: item.id,
    name: item.name,
    board_name: boardName,
    assignee_id: mondayUserId,
    timeline_start: timelineStart,
    timeline_end: timelineEnd,
    priority: priorityCol?.text ?? 'Normal',
    status: statusCol?.text ?? '',
    status_color: statusColors[(statusCol?.text ?? '').toLowerCase()] ?? null,
    monday_url: item.url ?? null,
    dropbox_link: dropboxLink,
  }
}

function processTeamItem(item: any, boardName: string, statusColors: Record<string, string> = {}): (Omit<MondayTask, 'assignee_id'> & { assignee_ids: string[] }) | null {
  const groupTitle = item.group?.title?.toLowerCase() ?? ''
  if (EXCLUDED_GROUPS.some(g => groupTitle.includes(g))) return null

  const cols = item.column_values ?? []

  const personCols = cols.filter((c: any) =>
    c.type === 'multiple-person' || c.type === 'people' || c.id === 'person' || c.id === 'people'
  )
  const timelineCol = cols.find((c: any) => c.type === 'timeline' || c.id === 'timeline')
  const priorityCol = cols.find((c: any) => c.type === 'status' && (c.id.includes('priority') || c.id.includes('Priority')))
  const statusCol = cols.find((c: any) => c.type === 'status' && c.id === 'status')
    ?? cols.find((c: any) => c.type === 'status' && c.id.includes('status') && !c.id.toLowerCase().includes('priority'))
    ?? cols.find((c: any) => c.type === 'status' && !c.id.toLowerCase().includes('priority') && c.text && c.text !== '-')

  const assignee_ids: string[] = []
  for (const personCol of personCols) {
    if (!personCol?.value) continue
    try {
      const personVal = JSON.parse(personCol.value)
      if (personVal?.personsAndTeams) {
        for (const p of personVal.personsAndTeams) {
          if (p.id) assignee_ids.push(String(p.id))
        }
      }
    } catch {}
  }

  if (assignee_ids.length === 0) return null

  let timelineStart = null
  let timelineEnd = null
  if (timelineCol?.value) {
    try {
      const tVal = JSON.parse(timelineCol.value)
      timelineStart = tVal?.from ?? null
      timelineEnd = tVal?.to ?? null
    } catch {}
  }

  let dropboxLink: string | null = null
  for (const c of cols) {
    try {
      if (c.value && c.value !== 'null') {
        const parsed = JSON.parse(c.value)
        const url = parsed?.url ?? (typeof parsed === 'string' ? parsed : null)
        if (url?.includes('dropbox.com')) { dropboxLink = url; break }
      }
    } catch {}
    if (c.text?.includes('dropbox.com')) { dropboxLink = c.text; break }
  }

  return {
    id: item.id,
    name: item.name,
    board_name: boardName,
    assignee_ids,
    timeline_start: timelineStart,
    timeline_end: timelineEnd,
    priority: priorityCol?.text ?? 'Normal',
    status: statusCol?.text ?? '',
    status_color: statusColors[(statusCol?.text ?? '').toLowerCase()] ?? null,
    monday_url: item.url ?? null,
    dropbox_link: dropboxLink,
  }
}

export async function fetchTasksForUser(
  boardIds: string[],
  mondayUserId: string,
  token: string,
  weekStart: string,
  nextWeekEnd: string,
  force = false,
): Promise<MondayTask[]> {
  const results = await Promise.allSettled(
    boardIds.map(id => fetchBoardItems(id, token, force))
  )

  const tasks: MondayTask[] = []
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.error(`Error fetching board ${boardIds[i]}:`, result.reason)
      return
    }
    const { name: boardName, items, statusColors } = result.value
    if (!boardName) return
    for (const item of items) {
      const task = processItem(item, boardName, mondayUserId, statusColors)
      if (task) tasks.push(task)
    }
  })

  return tasks
}

export async function fetchAllBoardTasks(
  boardIds: string[],
  token: string,
  force = false,
): Promise<Array<Omit<MondayTask, 'assignee_id'> & { assignee_ids: string[] }>> {
  const results = await Promise.allSettled(
    boardIds.map(id => fetchBoardItems(id, token, force))
  )

  const tasks: Array<Omit<MondayTask, 'assignee_id'> & { assignee_ids: string[] }> = []
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.error(`Error fetching board ${boardIds[i]}:`, result.reason)
      return
    }
    const { name: boardName, items, statusColors } = result.value
    if (!boardName) return
    for (const item of items) {
      const task = processTeamItem(item, boardName, statusColors)
      if (task) tasks.push(task)
    }
  })

  return tasks
}

export async function fetchTeamTasks(
  boardIds: string[],
  validUserIds: string[],
  token: string,
  weekStart: string,
  nextWeekEnd: string,
  force = false,
): Promise<Record<string, MondayTask[]>> {
  const tasksByUser: Record<string, MondayTask[]> = {}
  validUserIds.forEach(id => { tasksByUser[id] = [] })

  const results = await Promise.allSettled(
    boardIds.map(id => fetchBoardItems(id, token, force))
  )

  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.error(`Error fetching board ${boardIds[i]}:`, result.reason)
      return
    }
    const { name: boardName, items, statusColors } = result.value
    if (!boardName) return

    for (const item of items) {
      const teamTask = processTeamItem(item, boardName, statusColors)
      if (!teamTask) continue

      for (const assignee of teamTask.assignee_ids) {
        if (validUserIds.includes(assignee)) {
          tasksByUser[assignee].push({
            id: teamTask.id,
            name: teamTask.name,
            board_name: teamTask.board_name,
            assignee_id: assignee,
            timeline_start: teamTask.timeline_start,
            timeline_end: teamTask.timeline_end,
            priority: teamTask.priority,
            status: teamTask.status,
            status_color: teamTask.status_color,
            monday_url: teamTask.monday_url,
            dropbox_link: teamTask.dropbox_link,
          })
        }
      }
    }
  })

  return tasksByUser
}

export async function loadBoardCacheFromDb() {
  const rows = await loadAllBoardCacheEntries()
  let count = 0
  for (const { boardId, name, items, statusColors } of rows) {
    if (!boardItemCache.has(boardId)) {
      boardItemCache.set(boardId, { name, items, statusColors, fetchedAt: Date.now() })
      count++
    }
  }
  if (count > 0) console.log(`[startup] Loaded ${count} board(s) from DB cache`)
}

export async function incrementalSync(boardIds: string[], token: string): Promise<{ updatedItems: number }> {
  const lastSynced = await getCacheMeta('last_synced') ?? new Date(Date.now() - 60_000).toISOString()
  const now = new Date().toISOString()

  // 1. Fetch activity logs since lastSynced to find changed item IDs per board
  const changedByBoard = new Map<string, Set<string>>()

  await Promise.allSettled(boardIds.map(async (boardId) => {
    try {
      const data = await mondayQuery(`
        query {
          boards(ids: [${boardId}]) {
            activity_logs(limit: 500, from: "${lastSynced}", to: "${now}") {
              id event data
            }
          }
        }
      `, token)

      const logs: any[] = data?.boards?.[0]?.activity_logs ?? []
      const ids = new Set<string>()
      for (const log of logs) {
        try {
          const logData = JSON.parse(log.data ?? '{}')
          const pulseId = String(logData.pulse_id)
          if (pulseId && pulseId !== 'undefined') ids.add(pulseId)
        } catch {}
      }
      if (ids.size > 0) changedByBoard.set(boardId, ids)
    } catch (err) {
      console.error(`[sync] Activity log error for board ${boardId}:`, err)
    }
  }))

  // 2. For each board with changes, re-fetch only those items and merge into cache
  let totalUpdated = 0

  await Promise.allSettled(Array.from(changedByBoard.entries()).map(async ([boardId, itemIds]) => {
    try {
      const cached = boardItemCache.get(boardId)
      if (!cached) return

      const meta = await fetchBoardMeta(boardId, token)
      const colIdsArg = meta.neededColumnIds.length > 0
        ? `ids: [${meta.neededColumnIds.map(id => `"${id}"`).join(', ')}]`
        : ''

      const data = await mondayQuery(`
        query {
          items(ids: [${Array.from(itemIds).join(', ')}]) {
            id name url group { title }
            column_values(${colIdsArg}) { id type text value }
          }
        }
      `, token)

      const freshItems: any[] = data?.items ?? []
      if (freshItems.length === 0) return

      // Merge fresh items into cached items
      const itemMap = new Map(cached.items.map((item: any) => [String(item.id), item]))
      for (const item of freshItems) itemMap.set(String(item.id), item)

      const updated: BoardCache = { ...cached, items: Array.from(itemMap.values()), fetchedAt: Date.now() }
      boardItemCache.set(boardId, updated)
      setImmediate(async () => { await saveBoardCache(boardId, updated) })
      totalUpdated += freshItems.length
    } catch (err) {
      console.error(`[sync] Item update error for board ${boardId}:`, err)
    }
  }))

  await setCacheMeta('last_synced', now)
  return { updatedItems: totalUpdated }
}

export async function fetchDailyActivity(
  boardIds: string[],
  token: string,
  force = false,
): Promise<{ completedToday: DailyTask[]; inProgress: DailyTask[] }> {
  // Use local midnight so we capture changes from start of business day
  const todayLocalMidnight = new Date()
  todayLocalMidnight.setHours(0, 0, 0, 0)
  const from = todayLocalMidnight.toISOString()
  const to = new Date().toISOString()

  // Fetch board items (uses cache)
  const boardResults = await Promise.allSettled(
    boardIds.map(id => fetchBoardItems(id, token, force))
  )

  // Build itemId → raw item map for cross-referencing assignees/timeline
  const itemMap = new Map<string, { item: any; boardName: string; statusColors: Record<string, string> }>()
  boardResults.forEach((result) => {
    if (result.status === 'rejected') return
    const { name: boardName, items, statusColors } = result.value
    if (!boardName) return
    for (const item of items) {
      itemMap.set(String(item.id), { item, boardName, statusColors })
    }
  })

  // Fetch activity logs for all boards in parallel
  const completedIds = new Set<string>()
  const completedTasks: DailyTask[] = []

  await Promise.allSettled(boardIds.map(async (boardId, idx) => {
    const boardResult = boardResults[idx]
    if (boardResult.status === 'rejected') return
    const { name: boardName, statusColors } = boardResult.value
    if (!boardName) return

    try {
      const data = await mondayQuery(`
        query {
          boards(ids: [${boardId}]) {
            activity_logs(limit: 500, from: "${from}", to: "${to}") {
              id event data created_at
            }
          }
        }
      `, token)

      const logs: any[] = data?.boards?.[0]?.activity_logs ?? []

      for (const log of logs) {
        if (log.event !== 'update_column_value') continue
        try {
          const logData = JSON.parse(log.data ?? '{}')
          if (logData.column_type !== 'color') continue // status columns only
          const newStatus: string = logData.value?.label?.text ?? ''
          if (!COMPLETED_STATUSES.some(s => newStatus.toLowerCase().includes(s))) continue

          const pulseId = String(logData.pulse_id)
          if (completedIds.has(pulseId)) continue
          completedIds.add(pulseId)

          // Try to get full details from board item cache
          const cached = itemMap.get(pulseId)
          let assignee_ids: string[] = []
          let timeline_end: string | null = null
          let monday_url: string | null = null

          if (cached) {
            const cols: any[] = cached.item.column_values ?? []
            for (const personCol of cols.filter((c: any) =>
              c.type === 'multiple-person' || c.type === 'people' || c.id === 'person' || c.id === 'people'
            )) {
              if (!personCol?.value) continue
              try {
                const pv = JSON.parse(personCol.value)
                if (pv?.personsAndTeams) {
                  for (const p of pv.personsAndTeams) {
                    if (p.id) assignee_ids.push(String(p.id))
                  }
                }
              } catch {}
            }
            const timelineCol = cols.find((c: any) => c.type === 'timeline' || c.id === 'timeline')
            if (timelineCol?.value) {
              try { timeline_end = JSON.parse(timelineCol.value)?.to ?? null } catch {}
            }
            monday_url = cached.item.url ?? null
          }

          const statusColor = logData.value?.label?.style?.color
            ?? statusColors[newStatus.toLowerCase()]
            ?? null

          completedTasks.push({
            id: pulseId,
            name: logData.pulse_name ?? 'Unknown task',
            board_name: boardName,
            assignee_ids,
            status: newStatus,
            status_color: statusColor,
            timeline_end,
            monday_url,
          })
        } catch {}
      }
    } catch (err) {
      console.error(`[daily] Error fetching activity logs for board ${boardId}:`, err)
    }
  }))

  // In Progress: all cached items whose status is NOT completed (regardless of priority)
  const inProgressTasks: DailyTask[] = []
  boardResults.forEach((result) => {
    if (result.status === 'rejected') return
    const { name: boardName, items, statusColors } = result.value
    if (!boardName) return
    for (const item of items) {
      const task = processTeamItem(item, boardName, statusColors)
      if (!task) continue
      if (completedIds.has(task.id)) continue
      if (COMPLETED_STATUSES.some(s => task.status.toLowerCase().includes(s))) continue
      inProgressTasks.push({
        id: task.id,
        name: task.name,
        board_name: task.board_name,
        assignee_ids: task.assignee_ids,
        status: task.status,
        status_color: task.status_color,
        timeline_end: task.timeline_end,
        monday_url: task.monday_url,
      })
    }
  })

  return { completedToday: completedTasks, inProgress: inProgressTasks }
}

