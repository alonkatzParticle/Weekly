'use client'
import { useState, useEffect, useCallback } from 'react'
import { X, FileIcon, Play, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { MondayTask } from '@/lib/monday'

interface DropboxFile {
  name: string
  path_lower: string
  size: number
  is_image: boolean
  is_video: boolean
}

interface Props {
  task: MondayTask
  weekEnding: string
  memberName: string
  onClose: () => void
}

export function DropboxPreviewModal({ task, weekEnding, memberName, onClose }: Props) {
  const [files, setFiles] = useState<DropboxFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [copying, setCopying] = useState(false)
  const [copied, setCopied] = useState<Set<string>>(new Set())
  const [lightbox, setLightbox] = useState<DropboxFile | null>(null)

  useEffect(() => {
    if (!task.dropbox_link) return
    setLoading(true)
    setError('')
    fetch(`/api/dropbox/folder?url=${encodeURIComponent(task.dropbox_link)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error)
        setFiles(d.files ?? [])
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [task.dropbox_link])

  const mediaFiles = files.filter(f => f.is_image || f.is_video)

  const toggleSelect = useCallback((name: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }, [])

  const addToWeekly = useCallback(async () => {
    if (copying || selected.size === 0) return
    setCopying(true)
    const toAdd = files.filter(f => selected.has(f.name))
    const newlyCopied = new Set(copied)
    for (const file of toAdd) {
      try {
        const res = await fetch('/api/dropbox/copy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
          filePath: file.path_lower ?? null,
          sharedUrl: file.path_lower ? null : task.dropbox_link,
          fileName: file.name,
          weekEnding,
          memberName,
        }),
        })
        const data = await res.json()
        if (!data.success) throw new Error(data.error)
        newlyCopied.add(file.name)
      } catch (e) {
        alert(`Failed to copy ${file.name}: ${e}`)
      }
    }
    setCopied(newlyCopied)
    setSelected(new Set())
    setCopying(false)
  }, [copying, selected, files, copied, weekEnding, memberName])

  // For own-account files path_lower is an absolute Dropbox path → use get_temporary_link (redirect)
  // For cross-account shared folders path_lower is null → proxy through sharing/get_shared_link_file
  const thumbUrl = (file: DropboxFile) =>
    file.path_lower
      ? `/api/dropbox/thumbnail?path=${encodeURIComponent(file.path_lower)}`
      : `/api/dropbox/thumbnail?url=${encodeURIComponent(task.dropbox_link!)}&path=${encodeURIComponent(file.name)}`

  const playUrl = (file: DropboxFile) =>
    file.path_lower
      ? `/api/dropbox/thumbnail?path=${encodeURIComponent(file.path_lower)}&mode=play`
      : `/api/dropbox/thumbnail?url=${encodeURIComponent(task.dropbox_link!)}&path=${encodeURIComponent(file.name)}&mode=play`

  // Lightbox prev/next through media files only
  const lightboxIndex = lightbox ? mediaFiles.findIndex(f => f.name === lightbox.name) : -1
  const lightboxPrev = lightboxIndex > 0 ? () => setLightbox(mediaFiles[lightboxIndex - 1]) : null
  const lightboxNext = lightboxIndex < mediaFiles.length - 1 ? () => setLightbox(mediaFiles[lightboxIndex + 1]) : null

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className="bg-white w-full max-w-2xl max-h-[85vh] rounded-t-2xl sm:rounded-2xl flex flex-col shadow-xl">
          {/* Header */}
          <div className="flex items-start justify-between px-5 py-4 border-b shrink-0">
            <div className="min-w-0 flex-1 pr-4">
              <p className="text-xs text-muted-foreground mb-0.5">Dropbox Files</p>
              <h2 className="text-sm font-semibold leading-snug truncate">{task.name}</h2>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground mt-0.5">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5">
            {loading && (
              <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading files…</span>
              </div>
            )}
            {!loading && error && <p className="text-sm text-red-500 py-4">{error}</p>}
            {!loading && !error && files.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">No files found in this folder.</p>
            )}

            {!loading && !error && files.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {files.map(file => {
                  const isMedia = file.is_image || file.is_video
                  const isSelected = selected.has(file.name)
                  const isCopied = copied.has(file.name)

                  if (isMedia) {
                    return (
                      <div key={file.name} className="relative group aspect-square rounded-lg overflow-hidden border bg-muted">
                        {/* Thumbnail */}
                        <button
                          className="absolute inset-0 w-full h-full focus:outline-none"
                          onClick={() => setLightbox(file)}
                        >
                          <img
                            src={thumbUrl(file)}
                            alt={file.name}
                            className="w-full h-full object-cover"
                          />
                          {/* Play icon overlay for videos */}
                          {file.is_video && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <Play className="h-8 w-8 text-white drop-shadow-lg" />
                            </div>
                          )}
                          {/* Filename on hover */}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end pointer-events-none">
                            <p className="w-full text-white text-xs px-2 py-1 bg-black/50 translate-y-full group-hover:translate-y-0 transition-transform truncate">
                              {file.name}
                            </p>
                          </div>
                        </button>

                        {/* Checkbox top-left */}
                        {!isCopied && (
                          <button
                            onClick={e => { e.stopPropagation(); toggleSelect(file.name) }}
                            className={`absolute top-2 left-2 z-10 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                              isSelected
                                ? 'bg-primary border-primary'
                                : 'bg-white/80 border-white/80 opacity-0 group-hover:opacity-100'
                            }`}
                          >
                            {isSelected && (
                              <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 12 12">
                                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </button>
                        )}

                        {/* Copied overlay */}
                        {isCopied && (
                          <div className="absolute inset-0 bg-green-600/70 flex flex-col items-center justify-center gap-1 pointer-events-none">
                            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24">
                              <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <span className="text-white text-xs font-medium">Added</span>
                          </div>
                        )}
                      </div>
                    )
                  }

                  return (
                    <div key={file.name} className="rounded-lg border bg-muted aspect-square flex flex-col items-center justify-center gap-2 p-3">
                      <FileIcon className="h-8 w-8 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground text-center line-clamp-2 break-all">{file.name}</p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {!loading && !error && mediaFiles.length > 0 && (
            <div className="border-t px-5 py-3 flex items-center justify-between shrink-0">
              <p className="text-xs text-muted-foreground">
                {selected.size > 0 ? `${selected.size} selected` : 'Select files to add'}
              </p>
              <Button
                size="sm"
                onClick={addToWeekly}
                disabled={selected.size === 0 || copying}
                className="gap-2"
              >
                {copying && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Add to Weekly
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90"
          onClick={e => { if (e.target === e.currentTarget) setLightbox(null) }}
        >
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-white/70 hover:text-white">
            <X className="h-6 w-6" />
          </button>

          {lightboxPrev && (
            <button onClick={lightboxPrev} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-2">
              <ChevronLeft className="h-8 w-8" />
            </button>
          )}
          {lightboxNext && (
            <button onClick={lightboxNext} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-2">
              <ChevronRight className="h-8 w-8" />
            </button>
          )}

          <div className="max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-3">
            {lightbox.is_image ? (
              <img
                src={thumbUrl(lightbox)}
                alt={lightbox.name}
                className="max-w-full max-h-[80vh] object-contain rounded-lg"
              />
            ) : (
              <video
                src={playUrl(lightbox)}
                controls
                autoPlay
                className="max-w-full max-h-[80vh] rounded-lg"
              />
            )}
            <p className="text-white/70 text-sm">{lightbox.name}</p>
          </div>
        </div>
      )}
    </>
  )
}
