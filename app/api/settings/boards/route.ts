import { NextRequest, NextResponse } from 'next/server'
import { upsertBoardId, deleteBoardId, initDB } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    await initDB()
    const { board_id, board_name } = await req.json()
    await upsertBoardId(board_id, board_name)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await initDB()
    const { board_id } = await req.json()
    await deleteBoardId(board_id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
