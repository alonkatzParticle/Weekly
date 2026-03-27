import { NextRequest, NextResponse } from 'next/server'
import { getDropboxToken } from '@/lib/dropbox'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const EPOCH = new Date('2025-11-09T00:00:00')

function weekFolder(weekEnding: string): string {
  const sat = new Date(weekEnding + 'T00:00:00')
  const sun = new Date(sat)
  sun.setDate(sat.getDate() + 1)
  const index = Math.round((sun.getTime() - EPOCH.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
  const label = `${MONTHS[sun.getMonth()]}_${sun.getDate()}_${sun.getFullYear()}`
  return `${String(index).padStart(3, '0')}_${label}`
}

export async function POST(req: NextRequest) {
  try {
    const { fileName, memberName, weekEnding } = await req.json()

    if (!fileName || !memberName || !weekEnding) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const token = await getDropboxToken()
    const basePath = (process.env.DROPBOX_PATH ?? '/Weekly Reports').replace(/\/$/, '')
    const folder = weekFolder(weekEnding)
    const path = `${basePath}/${folder}/${memberName}/${fileName}`.replace(/\/+/g, '/')

    const response = await fetch('https://api.dropboxapi.com/2/files/get_temporary_upload_link', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        commit_info: {
          path,
          mode: 'add',
          autorename: true,
          mute: false
        },
        duration: 3600
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json({ error: `Dropbox link failed: ${errorText}` }, { status: 500 })
    }

    const data = await response.json()
    return NextResponse.json({ success: true, link: data.link })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
