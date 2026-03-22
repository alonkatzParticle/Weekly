// Cache the short-lived access token so we don't refresh on every request
let cachedToken: string | null = null
let tokenExpiresAt = 0

export async function getDropboxToken(): Promise<string> {
  const refreshToken = process.env.DROPBOX_REFRESH_TOKEN
  const appKey = process.env.DROPBOX_APP_KEY
  const appSecret = process.env.DROPBOX_APP_SECRET

  // If refresh credentials exist, use them (auto-refresh when near expiry)
  if (refreshToken && appKey && appSecret) {
    if (cachedToken && Date.now() < tokenExpiresAt - 5 * 60 * 1000) {
      return cachedToken
    }
    const res = await fetch('https://api.dropbox.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: appKey,
        client_secret: appSecret,
      }),
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`Dropbox token refresh failed: ${await res.text()}`)
    const data = await res.json()
    cachedToken = data.access_token
    tokenExpiresAt = Date.now() + data.expires_in * 1000
    return cachedToken!
  }

  // Fall back to static token
  const staticToken = process.env.DROPBOX_TOKEN
  if (!staticToken) throw new Error('No Dropbox credentials configured')
  return staticToken
}

export async function uploadToDropbox(
  file: Buffer,
  fileName: string,
  dropboxPath: string,
  accessToken: string
): Promise<{ success: boolean; path?: string; error?: string }> {
  const path = `${dropboxPath}/${fileName}`.replace(/\/+/g, '/')

  const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Dropbox-API-Arg': JSON.stringify({
        path,
        mode: 'add',
        autorename: true,
        mute: false,
      }),
      'Content-Type': 'application/octet-stream',
    },
    body: file as any,
  })

  if (!response.ok) {
    const error = await response.text()
    return { success: false, error: `Dropbox upload failed: ${error}` }
  }

  const result = await response.json()
  return { success: true, path: result.path_display }
}
