import { NextRequest, NextResponse } from 'next/server'
import { getBoardIds, getTeamMembers, initDB } from '@/lib/db'
import { fetchAllBoardTasks, clearBoardCache } from '@/lib/monday'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    await initDB()
    const { searchParams } = new URL(req.url)
    const force = searchParams.get('force') === 'true'

    const token = process.env.MONDAY_TOKEN
    if (!token) {
      return NextResponse.json({ error: 'MONDAY_TOKEN not set' }, { status: 500 })
    }

    const [boards, members] = await Promise.all([getBoardIds(), getTeamMembers()])
    const boardIds = boards.map((b: any) => b.board_id)

    if (boardIds.length === 0) {
      return NextResponse.json({ tasksByBoard: {} })
    }

    if (force) clearBoardCache()

    // Build monday_user_id -> name map
    const memberMap: Record<string, string> = {}
    for (const m of members) {
      if (m.monday_user_id) memberMap[String(m.monday_user_id)] = m.name
    }

    const allTasks = await fetchAllBoardTasks(boardIds, token, force)

    const today = new Date().toISOString().slice(0, 10)

    // Filter: high/critical priority AND not done/completed
    const filtered = allTasks.filter(t => {
      const priority = (t.priority ?? '').toLowerCase()
      const status = (t.status ?? '').toLowerCase()
      return /high|critical/.test(priority) && !/done|complet/.test(status)
    })

    // Filter: high/critical priority AND completed today
    const completedTodayRaw = allTasks.filter(t => {
      const priority = (t.priority ?? '').toLowerCase()
      const status = (t.status ?? '').toLowerCase()
      return /high|critical/.test(priority) && /done|complet/.test(status) && t.timeline_end === today
    })

    const toTitleCase = (name: string) =>
      name.replace(/\b\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())

    const resolveNames = (tasks: typeof allTasks) =>
      tasks.map(t => ({
        ...t,
        assignee_names: t.assignee_ids
          .map((id: string) => memberMap[id] ? toTitleCase(memberMap[id]) : null)
          .filter(Boolean) as string[],
      }))

    const withNames = resolveNames(filtered)
    const completedToday = resolveNames(completedTodayRaw)

    // Group by board, sort each group by priority (critical > high > medium)
    const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2 }
    const tasksByBoard: Record<string, typeof withNames> = {}
    for (const task of withNames) {
      if (!tasksByBoard[task.board_name]) tasksByBoard[task.board_name] = []
      tasksByBoard[task.board_name].push(task)
    }
    for (const board in tasksByBoard) {
      tasksByBoard[board].sort((a, b) => {
        const pa = priorityOrder[a.priority.toLowerCase()] ?? 3
        const pb = priorityOrder[b.priority.toLowerCase()] ?? 3
        return pa - pb
      })
    }

    return NextResponse.json({ tasksByBoard, completedToday })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
