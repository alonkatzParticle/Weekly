import { NextRequest, NextResponse } from 'next/server'
import { upsertTeamMember, deleteTeamMember, initDB } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    await initDB()
    const body = await req.json()
    await upsertTeamMember(body)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await initDB()
    const { id } = await req.json()
    await deleteTeamMember(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
