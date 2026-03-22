import { NextRequest, NextResponse } from 'next/server'
import { uploadToDropbox, getDropboxToken } from '@/lib/dropbox'

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
    const formData = await req.formData()
    const file = formData.get('file') as File
    const memberName = formData.get('memberName') as string
    const weekEnding = formData.get('weekEnding') as string

    if (!file || !memberName || !weekEnding) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const token = await getDropboxToken()
    const basePath = (process.env.DROPBOX_PATH ?? '/Weekly Reports').replace(/\/$/, '')
    const folder = weekFolder(weekEnding)
    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await uploadToDropbox(buffer, file.name, `${basePath}/${folder}/${memberName}`, token)

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
