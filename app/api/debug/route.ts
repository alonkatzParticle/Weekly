import { NextResponse } from 'next/server'
import { initDB, getTeamMembers, getBoardIds } from '@/lib/db'

export async function GET() {
  const result: Record<string, unknown> = {
    ANTHROPIC_API_KEY_set: !!process.env.ANTHROPIC_API_KEY,
    MONDAY_TOKEN_set: !!process.env.MONDAY_TOKEN,
    POSTGRES_URL_set: !!process.env.POSTGRES_URL,
  }

  try {
    await initDB()
    result.initDB = 'ok'
  } catch (e: any) {
    result.initDB = `ERROR: ${e?.message}`
  }

  try {
    const members = await getTeamMembers()
    result.members_count = members.length
    result.members = members.map((m: any) => m.name)
  } catch (e: any) {
    result.members = `ERROR: ${e?.message}`
  }

  try {
    const boards = await getBoardIds()
    result.boards_count = boards.length
    result.boards = boards.map((b: any) => b.board_name)
  } catch (e: any) {
    result.boards = `ERROR: ${e?.message}`
  }

  return NextResponse.json(result)
}
