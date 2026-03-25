import { getBoardIds, getTeamMembers, initDB } from './db'
import { fetchAllBoardTasks, clearBoardCache } from './monday'

export interface StatusTask {
  id: string
  name: string
  board_name: string
  assignee_ids: string[]
  assignee_names: string[]
  priority: string
  status: string
  status_color: string | null
  timeline_start: string | null
  timeline_end: string | null
  monday_url: string | null
}

export type TasksByBoard = Record<string, StatusTask[]>

export async function getStatusReportData(force = false): Promise<{ tasksByBoard: TasksByBoard; completedToday: StatusTask[] }> {
  await initDB()

  const token = process.env.MONDAY_TOKEN
  if (!token) throw new Error('MONDAY_TOKEN not set')

  const [boards, members] = await Promise.all([getBoardIds(), getTeamMembers()])
  const boardIds = boards.map((b: any) => b.board_id)

  if (boardIds.length === 0) return { tasksByBoard: {}, completedToday: [] }

  if (force) clearBoardCache()

  const memberMap: Record<string, string> = {}
  for (const m of members) {
    if (m.monday_user_id) memberMap[String(m.monday_user_id)] = m.name
  }

  const toTitleCase = (name: string) =>
    name.replace(/\b\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())

  const allTasks = await fetchAllBoardTasks(boardIds, token, force)
  const today = new Date().toISOString().slice(0, 10)

  const filtered = allTasks.filter(t => {
    const priority = (t.priority ?? '').toLowerCase()
    const status = (t.status ?? '').toLowerCase()
    return /high|critical/.test(priority) && !/done|complet/.test(status)
  })

  const completedTodayRaw = allTasks.filter(t => {
    const priority = (t.priority ?? '').toLowerCase()
    const status = (t.status ?? '').toLowerCase()
    return /high|critical/.test(priority) && /done|complet/.test(status) && t.timeline_end === today
  })

  const resolveNames = (tasks: typeof allTasks): StatusTask[] =>
    tasks.map(t => ({
      ...t,
      assignee_names: t.assignee_ids
        .map((id: string) => memberMap[id] ? toTitleCase(memberMap[id]) : null)
        .filter(Boolean) as string[],
    }))

  const withNames = resolveNames(filtered)
  const completedToday = resolveNames(completedTodayRaw)

  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2 }
  const tasksByBoard: TasksByBoard = {}
  for (const task of withNames) {
    if (!tasksByBoard[task.board_name]) tasksByBoard[task.board_name] = []
    tasksByBoard[task.board_name].push(task)
  }
  for (const board in tasksByBoard) {
    tasksByBoard[board].sort((a, b) =>
      (priorityOrder[a.priority.toLowerCase()] ?? 3) - (priorityOrder[b.priority.toLowerCase()] ?? 3)
    )
  }

  return { tasksByBoard, completedToday }
}
