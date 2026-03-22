import { NextRequest, NextResponse } from 'next/server'
import { fetchTeamTasks, clearBoardCache, MondayTask } from '@/lib/monday'
import { getBoardIds, getTeamMembers, initDB } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    await initDB()
    const { searchParams } = new URL(req.url)
    const weekStart = searchParams.get('week_start')
    const weekEnd = searchParams.get('week_end')
    const nextWeekStart = searchParams.get('next_week_start')
    const nextWeekEnd = searchParams.get('next_week_end')
    const force = searchParams.get('force') === 'true'

    if (!weekStart || !weekEnd) {
      return NextResponse.json({ error: 'Missing required params' }, { status: 400 })
    }

    const token = process.env.MONDAY_TOKEN
    if (!token) {
      return NextResponse.json({ error: 'MONDAY_TOKEN is not set in environment variables' }, { status: 500 })
    }

    const [boards, members] = await Promise.all([getBoardIds(), getTeamMembers()])
    const boardIds = boards.map((b: any) => b.board_id)
    if (boardIds.length === 0 || members.length === 0) {
      return NextResponse.json({})
    }

    const validUserIds = members.map((m: any) => m.monday_user_id).filter(Boolean) as string[]

    // If force refresh, wipe the board metadata cache
    if (force) clearBoardCache()

    const nwEnd = nextWeekEnd ?? weekEnd
    const nwStart = nextWeekStart ?? weekStart

    const tasksByUser = await fetchTeamTasks(boardIds, validUserIds, token, weekStart, nwEnd, force)

    const responsePayload: Record<string, { lastWeek: MondayTask[], thisWeek: MondayTask[] }> = {}

    for (const userId of validUserIds) {
      const allUserTasks = tasksByUser[userId] ?? []

      const lastWeekTasks = allUserTasks
        .filter(t => t.timeline_end && t.timeline_end >= weekStart && t.timeline_end <= weekEnd)
        .sort((a, b) => (a.timeline_end ?? '').localeCompare(b.timeline_end ?? ''))

      const thisWeekTasks = allUserTasks
        .filter(t => t.timeline_end && t.timeline_end >= nwStart && t.timeline_end <= nwEnd)
        .sort((a, b) => (a.timeline_end ?? '').localeCompare(b.timeline_end ?? ''))

      responsePayload[userId] = {
        lastWeek: lastWeekTasks,
        thisWeek: thisWeekTasks,
      }
    }

    return NextResponse.json(responsePayload)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
