import { NextRequest, NextResponse } from 'next/server'
import { getDropboxToken } from '@/lib/dropbox'

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const g = globalThis as any
if (!g._weeklyFilesCache) g._weeklyFilesCache = new Map<string, { data: any; fetchedAt: number }>()
const cache = g._weeklyFilesCache as Map<string, { data: any; fetchedAt: number }>

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const EPOCH = new Date('2025-11-09T00:00:00')

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.bmp', '.tiff', '.tif'])
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.wmv'])
function ext(name: string) { return name.slice(name.lastIndexOf('.')).toLowerCase() }

function weekFolder(weekEnding: string): string {
  const sat = new Date(weekEnding + 'T00:00:00')
  const sun = new Date(sat)
  sun.setDate(sat.getDate() + 1)
  const index = Math.round((sun.getTime() - EPOCH.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
  const label = `${MONTHS[sun.getMonth()]}_${sun.getDate()}_${sun.getFullYear()}`
  return `${String(index).padStart(3, '0')}_${label}`
}

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const weekEnding = req.nextUrl.searchParams.get('weekEnding')
  const memberName = req.nextUrl.searchParams.get('memberName')
  if (!weekEnding || !memberName) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  const cacheKey = `${weekEnding}:${memberName}`
  const hit = cache.get(cacheKey)
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL) {
    return NextResponse.json(hit.data)
  }

  const token = await getDropboxToken()
  const basePath = (process.env.DROPBOX_PATH ?? '/Weekly Reports').replace(/\/$/, '')

  const folder = weekFolder(weekEnding)
  const folderPath = `${basePath}/${folder}/${memberName}`

  const res = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: folderPath }),
    cache: 'no-store',
  })

  if (!res.ok) {
    // Folder may not exist yet — cache and return empty list
    const empty = { files: [], folder, folderPath, sharedLink: null }
    cache.set(cacheKey, { data: empty, fetchedAt: Date.now() })
    return NextResponse.json(empty)
  }

  const data = await res.json()
  const files = (data.entries ?? [])
    .filter((e: any) => e['.tag'] === 'file')
    .map((e: any) => ({
      name: e.name,
      path_lower: e.path_lower,
      is_image: IMAGE_EXTS.has(ext(e.name)),
      is_video: VIDEO_EXTS.has(ext(e.name)),
    }))
    .filter((f: any) => f.is_image || f.is_video)

  // Get or create a shared link for the folder so the link is always valid
  let sharedLink: string | null = null
  try {
    const listLinkRes = await fetch('https://api.dropboxapi.com/2/sharing/list_shared_links', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: folderPath, direct_only: true }),
      cache: 'no-store',
    })
    if (listLinkRes.ok) {
      const linkData = await listLinkRes.json()
      sharedLink = linkData.links?.[0]?.url ?? null
    }
    if (!sharedLink) {
      const createRes = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: folderPath, settings: { requested_visibility: 'team_only' } }),
      })
      if (createRes.ok) {
        const created = await createRes.json()
        sharedLink = created.url ?? null
      }
    }
  } catch {}

  const result = { files, folder, folderPath, sharedLink }
  cache.set(cacheKey, { data: result, fetchedAt: Date.now() })
  return NextResponse.json(result)
}
