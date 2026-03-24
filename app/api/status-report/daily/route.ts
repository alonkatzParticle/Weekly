import { NextRequest, NextResponse } from 'next/server'
import { getBoardIds, getTeamMembers, initDB } from '@/lib/db'
import { fetchDailyActivity, clearBoardCache } from '@/lib/monday'

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
      return NextResponse.json({ completedToday: [], inProgress: [] })
    }

    if (force) clearBoardCache()

    // Build monday_user_id -> name map
    const memberMap: Record<string, string> = {}
    for (const m of members) {
      if (m.monday_user_id) memberMap[String(m.monday_user_id)] = m.name
    }

    const toTitleCase = (name: string) =>
      name.replace(/\b\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())

    const { completedToday, inProgress } = await fetchDailyActivity(boardIds, token, force)

    const resolveNames = (tasks: typeof completedToday) =>
      tasks.map(t => ({
        ...t,
        assignee_names: t.assignee_ids
          .map((id: string) => memberMap[id] ? toTitleCase(memberMap[id]) : null)
          .filter(Boolean) as string[],
      }))

    return NextResponse.json({
      completedToday: resolveNames(completedToday),
      inProgress: resolveNames(inProgress),
      date: new Date().toISOString().slice(0, 10),
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
