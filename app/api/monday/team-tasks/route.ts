import { NextRequest, NextResponse } from 'next/server'
import { getTeamTasksData } from '@/lib/weeklyTasks'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const weekStart = searchParams.get('week_start')
    const weekEnd = searchParams.get('week_end')
    const nextWeekStart = searchParams.get('next_week_start')
    const nextWeekEnd = searchParams.get('next_week_end')
    const force = searchParams.get('force') === 'true'

    if (!weekStart || !weekEnd || !nextWeekStart || !nextWeekEnd) {
      return NextResponse.json({ error: 'Missing required params' }, { status: 400 })
    }

    const { tasksByUser } = await getTeamTasksData(weekStart, weekEnd, nextWeekStart, nextWeekEnd, force)
    return NextResponse.json(tasksByUser)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
