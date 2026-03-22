import { NextRequest, NextResponse } from 'next/server'
import { getDropboxToken } from '@/lib/dropbox'

export async function POST(req: NextRequest) {
  const { path } = await req.json()
  if (!path) return NextResponse.json({ error: 'Missing path' }, { status: 400 })

  const token = await getDropboxToken()

  const res = await fetch('https://api.dropboxapi.com/2/files/delete_v2', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  })

  if (!res.ok) {
    const error = await res.text()
    return NextResponse.json({ success: false, error }, { status: res.status })
  }

  return NextResponse.json({ success: true })
}
