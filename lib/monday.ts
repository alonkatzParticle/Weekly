export interface MondayTask {
  id: string
  name: string
  board_name: string
  assignee_id: string
  timeline_start: string | null
  timeline_end: string | null
  priority: string
  status: string
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
  // IDs of columns we actually need to fetch on every item (reduces response size)
  neededColumnIds: string[]
  fetchedAt: number
}
const BOARD_META_TTL = 60 * 60 * 1000

// Board item cache: keyed by boardId. Items are fetched once and reused for any
// date/person query within the TTL. Selective columns keep the payload small.
interface BoardCache {
  name: string
  items: any[]
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
    `query { boards(ids: [${boardId}]) { name columns { id type title } } }`,
    token
  )
  const board = data?.boards?.[0]
  if (!board?.name) return { name: '', timelineColId: null, neededColumnIds: [], fetchedAt: Date.now() }

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

  const meta: BoardMeta = {
    name: board.name,
    timelineColId: timelineCol?.id ?? null,
    neededColumnIds: Array.from(needed),
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
    const cached = boardItemCache.get(boardId)
    if (cached && Date.now() - cached.fetchedAt < BOARD_ITEM_TTL) return cached
  }

  // Deduplicate concurrent in-flight requests for the same board (skip when force=true)
  if (!force) {
    const inflight = inflightFetches.get(boardId)
    if (inflight) return inflight
  }

  const promise = (async () => {
    try {
      const meta = await fetchBoardMeta(boardId, token)
      if (!meta.name) return { name: '', items: [], fetchedAt: Date.now() }

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

      const result: BoardCache = { name: meta.name, items, fetchedAt: Date.now() }
      boardItemCache.set(boardId, result)
      return result
    } finally {
      inflightFetches.delete(boardId)
    }
  })()

  inflightFetches.set(boardId, promise)
  return promise
}

function processItem(item: any, boardName: string, mondayUserId: string): MondayTask | null {
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
    monday_url: item.url ?? null,
    dropbox_link: dropboxLink,
  }
}

function processTeamItem(item: any, boardName: string): (Omit<MondayTask, 'assignee_id'> & { assignee_ids: string[] }) | null {
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
    const { name: boardName, items } = result.value
    if (!boardName) return
    for (const item of items) {
      const task = processItem(item, boardName, mondayUserId)
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
    const { name: boardName, items } = result.value
    if (!boardName) return

    for (const item of items) {
      const teamTask = processTeamItem(item, boardName)
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
            monday_url: teamTask.monday_url,
            dropbox_link: teamTask.dropbox_link,
          })
        }
      }
    }
  })

  return tasksByUser
}

export async function fetchTimeTracking(
  boardIds: string[],
  mondayUserId: string,
  token: string,
  weekStart: string,
  weekEnd: string
): Promise<{ currentWeek: number; history: { weekEnding: string; hours: number }[] }> {
  let totalHours = 0
  const weekMap: Record<string, number> = {}

  for (const boardId of boardIds) {
    const query = `
      query {
        boards(ids: [${boardId}]) {
          items_page(limit: 500) {
            items {
              column_values {
                id
                type
                text
                value
              }
            }
          }
        }
      }
    `

    try {
      const data = await mondayQuery(query, token)
      const items = data?.boards?.[0]?.items_page?.items ?? []

      for (const item of items) {
        const cols = item.column_values ?? []
        const personCols = cols.filter((c: any) =>
          c.type === 'multiple-person' || c.type === 'people' || c.id === 'person' || c.id === 'people'
        )
        const timeTrackCol = cols.find((c: any) => c.id === 'duration_mkynps36')
          ?? cols.find((c: any) => c.type === 'time_tracking')

        if (!timeTrackCol?.value) continue

        let isAssigned = false
        for (const personCol of personCols) {
          if (!personCol?.value) continue
          try {
            const pv = JSON.parse(personCol.value)
            if (pv?.personsAndTeams?.some((p: any) => String(p.id) === String(mondayUserId))) {
              isAssigned = true
              break
            }
          } catch {}
        }

        if (!isAssigned) continue

        try {
          const ttVal = JSON.parse(timeTrackCol.value)
          const entries: any[] = ttVal?.additional_value ?? []

          for (const entry of entries) {
            const startTime = entry?.started_at ? new Date(entry.started_at) : null
            const endTime = entry?.ended_at ? new Date(entry.ended_at) : null
            if (!startTime || !endTime) continue

            const hours = (endTime.getTime() - startTime.getTime()) / 3600000
            const entryDate = startTime.toISOString().split('T')[0]

            if (entryDate >= weekStart && entryDate <= weekEnd) {
              totalHours += hours
            }

            const weekEndDate = getWeekEndForDate(startTime)
            if (!weekMap[weekEndDate]) weekMap[weekEndDate] = 0
            weekMap[weekEndDate] += hours
          }
        } catch {}
      }
    } catch (err) {
      console.error(`Error fetching time tracking for board ${boardId}:`, err)
    }
  }

  const history = Object.entries(weekMap)
    .map(([weekEnding, hours]) => ({ weekEnding, hours: Math.round(hours * 10) / 10 }))
    .sort((a, b) => a.weekEnding.localeCompare(b.weekEnding))
    .slice(-6)

  return { currentWeek: Math.round(totalHours * 10) / 10, history }
}

function getWeekEndForDate(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const saturday = new Date(d)
  saturday.setDate(d.getDate() + (6 - day))
  return saturday.toISOString().split('T')[0]
}
