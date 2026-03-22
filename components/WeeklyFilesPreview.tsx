'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, Play, ChevronLeft, ChevronRight, X, ExternalLink, Pencil, Check, ChevronRight as ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface WeeklyFile {
  name: string
  path_lower: string
  is_image: boolean
  is_video: boolean
}

interface Props {
  memberName: string
  weekEnding: string
}

export function WeeklyFilesPreview({ memberName, weekEnding }: Props) {
  const [files, setFiles] = useState<WeeklyFile[]>([])
  const [folder, setFolder] = useState('')
  const [folderPath, setFolderPath] = useState('')
  const [sharedLink, setSharedLink] = useState('')
  const [loading, setLoading] = useState(true)
  const [lightbox, setLightbox] = useState<WeeklyFile | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [deleting, setDeleting] = useState<Set<string>>(new Set())
  const [canScrollRight, setCanScrollRight] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const checkScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  useEffect(() => {
    checkScroll()
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', checkScroll)
    const ro = new ResizeObserver(checkScroll)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', checkScroll); ro.disconnect() }
  }, [checkScroll, files])

  const fetchFiles = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/dropbox/weekly-files?weekEnding=${encodeURIComponent(weekEnding)}&memberName=${encodeURIComponent(memberName)}&t=${Date.now()}`,
        { cache: 'no-store' }
      )
      const data = await res.json()
      setFiles(data.files ?? [])
      setFolder(data.folder ?? '')
      setFolderPath(data.folderPath ?? '')
      setSharedLink(data.sharedLink ?? '')
    } catch {
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [memberName, weekEnding])

  useEffect(() => { fetchFiles() }, [fetchFiles])

  const thumbUrl = (path: string) =>
    `/api/dropbox/thumbnail?path=${encodeURIComponent(path)}`

  const playUrl = (path: string) =>
    `/api/dropbox/thumbnail?path=${encodeURIComponent(path)}&mode=play`

  const deleteFile = async (file: WeeklyFile) => {
    setDeleting(prev => new Set(prev).add(file.path_lower))
    try {
      await fetch('/api/dropbox/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: file.path_lower }),
      })
      setFiles(prev => prev.filter(f => f.path_lower !== file.path_lower))
    } finally {
      setDeleting(prev => { const s = new Set(prev); s.delete(file.path_lower); return s })
    }
  }

  const lightboxIndex = lightbox ? files.findIndex(f => f.path_lower === lightbox.path_lower) : -1
  const lightboxPrev = lightboxIndex > 0 ? () => setLightbox(files[lightboxIndex - 1]) : null
  const lightboxNext = lightboxIndex < files.length - 1 ? () => setLightbox(files[lightboxIndex + 1]) : null

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Selected Files</CardTitle>
              {folder && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[400px]">
                  {folder}/{memberName}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              {files.length > 0 && (
                <button
                  onClick={() => setEditMode(e => !e)}
                  className={`text-xs flex items-center gap-1 transition-colors ${editMode ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {editMode ? <><Check className="h-3.5 w-3.5" /> Done</> : <><Pencil className="h-3.5 w-3.5" /> Edit</>}
                </button>
              )}
              {sharedLink && (
                <a
                  href={sharedLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Open in Dropbox"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
              <button
                onClick={fetchFiles}
                disabled={loading}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Refresh"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="shrink-0 w-28 h-28 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : files.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              No files added yet for this week.
            </p>
          ) : (
            <div className="relative">
            <div ref={scrollRef} className={`flex gap-4 overflow-x-auto pb-2 ${editMode ? 'pt-3 pl-2' : ''}`}>
              {files.map(file => (
                <div key={file.path_lower} className="relative shrink-0 w-[260px] h-[260px]">
                  <button
                    onClick={() => !editMode && setLightbox(file)}
                    className="relative w-full h-full rounded-lg overflow-hidden border bg-muted group focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <img
                      src={thumbUrl(file.path_lower)}
                      alt={file.name}
                      className="w-full h-full object-cover"
                    />
                    {file.is_video && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <Play className="h-10 w-10 text-white drop-shadow-lg" />
                      </div>
                    )}
                    {!editMode && (
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end pointer-events-none">
                        <p className="w-full text-white text-[10px] px-1.5 py-1 bg-black/50 translate-y-full group-hover:translate-y-0 transition-transform truncate">
                          {file.name}
                        </p>
                      </div>
                    )}
                  </button>
                  {editMode && (
                    <button
                      onClick={() => deleteFile(file)}
                      disabled={deleting.has(file.path_lower)}
                      className="absolute -top-2 -left-2 z-10 w-6 h-6 rounded-full bg-red-500 border-2 border-white flex items-center justify-center shadow-md hover:bg-red-600 transition-colors disabled:opacity-50"
                    >
                      <X className="h-3 w-3 text-white" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {canScrollRight && (
              <div className="absolute right-0 top-0 bottom-2 w-16 bg-gradient-to-l from-white to-transparent pointer-events-none flex items-center justify-end pr-1">
                <ChevronRight className="h-6 w-6 text-muted-foreground animate-pulse" />
              </div>
            )}
            </div>
          )}
        </CardContent>
      </Card>

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
                src={thumbUrl(lightbox.path_lower)}
                alt={lightbox.name}
                className="max-w-full max-h-[80vh] object-contain rounded-lg"
              />
            ) : (
              <video
                src={playUrl(lightbox.path_lower)}
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
