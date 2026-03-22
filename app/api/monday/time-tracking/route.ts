import { NextRequest, NextResponse } from 'next/server'
import { fetchTimeTracking } from '@/lib/monday'
import { getBoardIds, initDB } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    await initDB()
    const { searchParams } = new URL(req.url)
    const mondayUserId = searchParams.get('user_id')
    const weekStart = searchParams.get('week_start')
    const weekEnd = searchParams.get('week_end')

    if (!mondayUserId || !weekStart || !weekEnd) {
      return NextResponse.json({ error: 'Missing required params' }, { status: 400 })
    }

    const token = process.env.MONDAY_TOKEN
    if (!token) {
      return NextResponse.json({ error: 'MONDAY_TOKEN is not set in environment variables' }, { status: 500 })
    }

    const boards = await getBoardIds()
    const boardIds = boards.map((b: any) => b.board_id)
    const result = await fetchTimeTracking(boardIds, mondayUserId, token, weekStart, weekEnd)

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
