import { NextRequest, NextResponse } from 'next/server'
import { getDropboxToken } from '@/lib/dropbox'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

// Index 001 = Sunday, November 9, 2025
const EPOCH = new Date('2025-11-09T00:00:00')

function weekFolder(weekEnding: string): string {
  // weekEnding is Saturday (end of last week); the selected/current week starts the next day (Sunday)
  const sat = new Date(weekEnding + 'T00:00:00')
  const sun = new Date(sat)
  sun.setDate(sat.getDate() + 1)
  const index = Math.round((sun.getTime() - EPOCH.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
  const label = `${MONTHS[sun.getMonth()]}_${sun.getDate()}_${sun.getFullYear()}`
  return `${String(index).padStart(3, '0')}_${label}`
}

export async function POST(req: NextRequest) {
  try {
    const { filePath, sharedUrl, fileName, weekEnding, memberName } = await req.json()
    if ((!filePath && !sharedUrl) || !fileName || !weekEnding || !memberName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const token = await getDropboxToken()
    const basePath = (process.env.DROPBOX_PATH ?? '/Weekly Reports').replace(/\/$/, '')
    const folder = weekFolder(weekEnding)
    const toPath = `${basePath}/${folder}/${memberName}/${fileName}`

    // Own-account file: use server-side copy (fast, no data transfer)
    if (filePath) {
      const res = await fetch('https://api.dropboxapi.com/2/files/copy_v2', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_path: filePath, to_path: toPath, autorename: true }),
      })
      if (!res.ok) {
        const err = await res.text()
        return NextResponse.json({ error: `Copy failed: ${err}` }, { status: 500 })
      }
      const data = await res.json()
      return NextResponse.json({ success: true, path: data.metadata?.path_lower })
    }

    // Cross-account file: download via shared link then upload
    const relPath = fileName.startsWith('/') ? fileName : `/${fileName}`

    const downloadRes = await fetch('https://content.dropboxapi.com/2/sharing/get_shared_link_file', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Dropbox-API-Arg': JSON.stringify({ url: sharedUrl, path: relPath }),
      },
    })
    if (!downloadRes.ok) {
      const err = await downloadRes.text()
      return NextResponse.json({ error: `Download failed: ${err}` }, { status: 500 })
    }

    const uploadRes = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({ path: toPath, mode: 'add', autorename: true }),
      },
      body: downloadRes.body,
      // @ts-ignore — duplex required for streaming body in Node 18+
      duplex: 'half',
    })
    if (!uploadRes.ok) {
      const err = await uploadRes.text()
      return NextResponse.json({ error: `Upload failed: ${err}` }, { status: 500 })
    }

    const data = await uploadRes.json()
    return NextResponse.json({ success: true, path: data.path_lower })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
