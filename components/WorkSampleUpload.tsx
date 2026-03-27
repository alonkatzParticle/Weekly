'use client'
import { useState, useCallback, useRef } from 'react'
import { Upload, CheckCircle, XCircle, Loader2, Link } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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

interface UploadStatus {
  name: string
  status: 'uploading' | 'success' | 'error'
  path?: string
  error?: string
}

interface WorkSampleUploadProps {
  memberName: string
  weekEnding: string
}

export function WorkSampleUpload({ memberName, weekEnding }: WorkSampleUploadProps) {
  const [uploads, setUploads] = useState<UploadStatus[]>([])
  const [dragging, setDragging] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [urlTitle, setUrlTitle] = useState('')
  const [urlSaving, setUrlSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const folder = weekFolder(weekEnding)

  const uploadFile = async (file: File) => {
    setUploads(prev => [...prev, { name: file.name, status: 'uploading' }])

    const formData = new FormData()
    formData.append('file', file)
    formData.append('memberName', memberName)
    formData.append('weekEnding', weekEnding)

    try {
      const res = await fetch('/api/dropbox/upload', { method: 'POST', body: formData })
      const data = await res.json()
      setUploads(prev => prev.map(u =>
        u.name === file.name
          ? { ...u, status: data.success ? 'success' : 'error', path: data.path, error: data.error }
          : u
      ))
    } catch (err) {
      setUploads(prev => prev.map(u =>
        u.name === file.name ? { ...u, status: 'error', error: String(err) } : u
      ))
    }
  }

  const handleFiles = (files: FileList | null) => {
    if (!files) return
    Array.from(files).forEach(uploadFile)
  }

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      handleFiles(e.dataTransfer.files)
    },
    [weekEnding, memberName] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const saveUrl = async () => {
    const trimmed = urlInput.trim()
    if (!trimmed) return
    setUrlSaving(true)
    const name = `${(urlTitle.trim() || trimmed).slice(0, 60)}.url`
    setUploads(prev => [...prev, { name, status: 'uploading' }])
    try {
      const res = await fetch('/api/dropbox/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed, title: urlTitle.trim() || trimmed, memberName, weekEnding }),
      })
      const data = await res.json()
      setUploads(prev => prev.map(u =>
        u.name === name
          ? { ...u, status: data.success ? 'success' : 'error', path: data.path, error: data.error }
          : u
      ))
      if (data.success) { setUrlInput(''); setUrlTitle('') }
    } catch (err) {
      setUploads(prev => prev.map(u =>
        u.name === name ? { ...u, status: 'error', error: String(err) } : u
      ))
    } finally {
      setUrlSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Upload className="h-4 w-4" />
          Upload Work Samples
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* File drop zone */}
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
          }`}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground mb-2">Drop files here or</p>
          <div>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              Browse Files
            </Button>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => {
              if (e.target.files) handleFiles(e.target.files)
            }} />
          </div>
          <p className="text-xs text-muted-foreground mt-2">→ {folder}/{memberName}/</p>
        </div>

        {/* URL shortcut */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Link className="h-3 w-3" /> Save URL as shortcut
          </p>
          <input
            type="text"
            placeholder="https://..."
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            className="w-full text-sm border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Title (optional)"
              value={urlTitle}
              onChange={e => setUrlTitle(e.target.value)}
              className="flex-1 text-sm border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <Button size="sm" onClick={saveUrl} disabled={!urlInput.trim() || urlSaving}>
              {urlSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
            </Button>
          </div>
        </div>

        {/* Upload status */}
        {uploads.length > 0 && (
          <div className="space-y-2">
            {uploads.map((upload, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                {upload.status === 'uploading' && <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />}
                {upload.status === 'success' && <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />}
                {upload.status === 'error' && <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                <span className="flex-1 truncate">{upload.name}</span>
                {upload.status === 'error' && (
                  <span className="text-red-500 text-xs truncate max-w-[200px]">{upload.error}</span>
                )}
                {upload.status === 'success' && <span className="text-green-600 text-xs shrink-0">Uploaded</span>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
