import { NextRequest, NextResponse } from 'next/server'
import { getDropboxToken } from '@/lib/dropbox'

export const dynamic = 'force-dynamic'

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.bmp', '.tiff', '.tif'])
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.wmv'])

function ext(name: string) { return name.slice(name.lastIndexOf('.')).toLowerCase() }
function isImage(name: string) { return IMAGE_EXTS.has(ext(name)) }
function isVideo(name: string) { return VIDEO_EXTS.has(ext(name)) }

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'Missing url param' }, { status: 400 })

  const token = await getDropboxToken()

  const res = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path: '', shared_link: { url }, recursive: false }),
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: err }, { status: res.status })
  }

  const data = await res.json()
  const files = (data.entries ?? [])
    .filter((e: any) => e['.tag'] === 'file')
    .map((e: any) => ({
      name: e.name,
      path_lower: e.path_lower,
      size: e.size,
      is_image: isImage(e.name),
      is_video: isVideo(e.name),
    }))

  return NextResponse.json({ files })
}
