import { NextRequest, NextResponse } from 'next/server'
import { getTeamMembers, getAISummary, initDB } from '@/lib/db'
import { getWeekRange, formatDate } from '@/lib/utils'

export async function GET(req: NextRequest) {
  try {
    await initDB()
    const { searchParams } = new URL(req.url)
    const weekEnding = searchParams.get('week_ending')

    if (!weekEnding) {
      return NextResponse.json({ error: 'Missing week_ending param' }, { status: 400 })
    }

    const members = await getTeamMembers()

    const summaries = await Promise.all(
      members.map(async (member: any) => {
        const [lastWeek, thisWeek] = await Promise.all([
          getAISummary(member.id, weekEnding, 'last_week'),
          getAISummary(member.id, weekEnding, 'this_week'),
        ])
        return {
          member,
          lastWeek: lastWeek?.content ?? null,
          thisWeek: thisWeek?.content ?? null,
        }
      })
    )

    return NextResponse.json({ weekEnding, summaries })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
