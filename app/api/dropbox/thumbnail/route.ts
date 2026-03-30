import { NextRequest, NextResponse } from 'next/server'
import { getDropboxToken, encodeDropboxArg } from '@/lib/dropbox'

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get('path')
  const url = req.nextUrl.searchParams.get('url')   // shared folder link (cross-account)
  const mode = req.nextUrl.searchParams.get('mode') ?? 'thumb'

  if (!path) return NextResponse.json({ error: 'Missing path param' }, { status: 400 })

  const token = await getDropboxToken()

  // Cross-account shared folder: use get_thumbnail_v2 with "link" resource for thumbnails,
  // and proxy get_shared_link_file for playback
  if (url) {
    const relPath = path.startsWith('/') ? path : `/${path}`

    if (mode === 'play') {
      // Proxy file content with Range header passthrough for video seeking
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'Dropbox-API-Arg': encodeDropboxArg({ url, path: relPath }),
      }
      const rangeHeader = req.headers.get('range')
      if (rangeHeader) headers['Range'] = rangeHeader

      const fileRes = await fetch('https://content.dropboxapi.com/2/sharing/get_shared_link_file', {
        method: 'POST',
        headers,
      })

      if (!fileRes.ok) {
        const err = await fileRes.text()
        console.error('[thumbnail/play] get_shared_link_file failed:', fileRes.status, err)
        return new NextResponse(null, { status: fileRes.status })
      }

      const resHeaders: Record<string, string> = {
        'Content-Type': fileRes.headers.get('content-type') ?? 'application/octet-stream',
      }
      for (const h of ['content-range', 'accept-ranges', 'content-length']) {
        const val = fileRes.headers.get(h)
        if (val) resHeaders[h] = val
      }
      return new NextResponse(fileRes.body, { status: fileRes.status, headers: resHeaders })
    }

    // Thumbnail mode: use get_thumbnail_v2 with "link" tag — works for images AND videos
    const thumbRes = await fetch('https://content.dropboxapi.com/2/files/get_thumbnail_v2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Dropbox-API-Arg': encodeDropboxArg({
          resource: { '.tag': 'link', url, path: relPath },
          format: { '.tag': 'jpeg' },
          size: { '.tag': 'w640h480' },
        }),
      },
    })

    if (!thumbRes.ok) {
      const err = await thumbRes.text()
      console.error('[thumbnail/thumb] get_thumbnail_v2 failed:', thumbRes.status, err)
      return new NextResponse(null, { status: thumbRes.status })
    }

    const imageBuffer = await thumbRes.arrayBuffer()
    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  }

  // Own account — playback: redirect to temporary direct link
  if (mode === 'play') {
    const linkRes = await fetch('https://api.dropboxapi.com/2/files/get_temporary_link', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    })
    if (!linkRes.ok) {
      console.error('[thumbnail/own/play] get_temporary_link failed:', linkRes.status, await linkRes.text())
      return new NextResponse(null, { status: linkRes.status })
    }
    const { link } = await linkRes.json()
    return NextResponse.redirect(link)
  }

  // Own account — thumbnail: use get_thumbnail_v2 with path tag (works for images + videos)
  const thumbRes = await fetch('https://content.dropboxapi.com/2/files/get_thumbnail_v2', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Dropbox-API-Arg': encodeDropboxArg({
        resource: { '.tag': 'path', path },
        format: { '.tag': 'jpeg' },
        size: { '.tag': 'w640h480' },
      }),
    },
  })
  if (!thumbRes.ok) {
    console.error('[thumbnail/own/thumb] get_thumbnail_v2 failed:', thumbRes.status, await thumbRes.text())
    return new NextResponse(null, { status: thumbRes.status })
  }
  const buf = await thumbRes.arrayBuffer()
  return new NextResponse(buf, {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600' },
  })
}
