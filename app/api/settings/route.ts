import { NextResponse } from 'next/server'
import { getTeamMembers, getBoardIds, initDB } from '@/lib/db'

export async function GET() {
  try {
    await initDB()
    const [members, boards] = await Promise.all([getTeamMembers(), getBoardIds()])

    return NextResponse.json({
      members,
      boards,
      // Surface which env vars are configured (true/false only — never expose values)
      env: {
        MONDAY_TOKEN: !!process.env.MONDAY_TOKEN,
        ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
        DROPBOX_TOKEN: !!process.env.DROPBOX_TOKEN,
        DROPBOX_PATH: process.env.DROPBOX_PATH ?? '/Weekly Reports',
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
