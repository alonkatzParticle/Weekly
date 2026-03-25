import { NextResponse } from 'next/server'
import { getBoardIds, initDB } from '@/lib/db'
import { incrementalSync } from '@/lib/monday'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    await initDB()
    const token = process.env.MONDAY_TOKEN
    if (!token) return NextResponse.json({ error: 'MONDAY_TOKEN not set' }, { status: 500 })

    const boards = await getBoardIds()
    const boardIds = boards.map((b: any) => b.board_id)
    if (boardIds.length === 0) return NextResponse.json({ updatedItems: 0 })

    const result = await incrementalSync(boardIds, token)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
