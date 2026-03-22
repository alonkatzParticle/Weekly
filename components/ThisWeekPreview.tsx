'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, ChevronDown, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MarkdownText } from '@/components/MarkdownText'
import type { MondayTask } from '@/lib/monday'

interface ThisWeekPreviewProps {
  memberId: number
  memberName: string
  weekEnd: string
  tasks: MondayTask[]
  tasksLoaded: boolean
  tasksError: string
  onRefreshTasks?: () => void
}

function SummaryScroll({ children, loading }: { children: React.ReactNode; loading: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [hasMore, setHasMore] = useState(false)

  const check = () => {
    const el = ref.current
    if (!el) return
    setHasMore(el.scrollHeight > el.clientHeight + 4 && el.scrollTop + el.clientHeight < el.scrollHeight - 4)
  }

  useEffect(() => { check() }, [loading, children])

  return (
    <div className="relative">
      <div ref={ref} onScroll={check} className="h-[14rem] overflow-y-auto">
        {children}
      </div>
      {hasMore && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white to-transparent flex items-end justify-center pb-1">
          <ChevronDown className="h-4 w-4 text-muted-foreground animate-bounce" />
        </div>
      )}
    </div>
  )
}

export function ThisWeekPreview({
  memberId,
  memberName,
  weekEnd,
  tasks,
  tasksLoaded,
  tasksError,
  onRefreshTasks,
}: ThisWeekPreviewProps & { onRefreshTasks?: () => void }) {
  const [summary, setSummary] = useState('')
  const [summaryLoading, setSummaryLoading] = useState(false)
  const autoFetchedRef = useRef<string | null>(null)

  const fetchSummary = useCallback(
    async (regenerate = false) => {
      setSummaryLoading(true)
      setSummary('')
      try {
        const res = await fetch('/api/ai/summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            memberId,
            memberName,
            tasks,
            type: 'this_week',
            weekEnding: weekEnd,
            regenerate,
          }),
        })
        if (!res.ok) throw new Error('Failed to generate summary')
        const reader = res.body?.getReader()
        if (!reader) return
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          setSummary(prev => prev + new TextDecoder().decode(value))
        }
      } catch (err) {
        setSummary(`Error generating summary: ${err}`)
      } finally {
        setSummaryLoading(false)
      }
    },
    [memberId, memberName, tasks, weekEnd]
  )

  // Auto-fetch summary once tasks are loaded — keyed on memberId+weekEnd so switching tabs re-fetches
  const summaryKey = `${memberId}-${weekEnd}`
  useEffect(() => {
    if (tasksLoaded && autoFetchedRef.current !== summaryKey) {
      autoFetchedRef.current = summaryKey
      fetchSummary()
    }
  }, [tasksLoaded, summaryKey]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!tasksLoaded)
    return (
      <div className="animate-pulse text-sm text-muted-foreground p-4">
        Loading upcoming tasks...
      </div>
    )
  if (tasksError) return <div className="text-red-500 text-sm p-4">{tasksError}</div>

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">This Week Preview</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchSummary(true)}
              disabled={summaryLoading}
              className="h-7 gap-1 text-xs"
            >
              <RefreshCw className={`h-3 w-3 ${summaryLoading ? 'animate-spin' : ''}`} />
              Regenerate
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <SummaryScroll loading={summaryLoading}>
            {summaryLoading ? (
              <div className="space-y-2">
                <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
                <div className="h-4 bg-muted animate-pulse rounded w-full" />
              </div>
            ) : (
              summary
                ? <MarkdownText text={summary} />
                : <p className="text-sm text-muted-foreground">No upcoming tasks found.</p>
            )}
          </SummaryScroll>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Upcoming Tasks ({tasks.length})</CardTitle>
            {onRefreshTasks && (
              <button
                onClick={onRefreshTasks}
                disabled={!tasksLoaded}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                title="Refresh tasks from Monday.com"
              >
                <RefreshCw className="h-3 w-3" />
                Refresh
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="h-[40vh] overflow-y-auto">
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming tasks for this week.</p>
          ) : (
            <div className="space-y-2">
              {tasks.map(task => (
                <div key={task.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{task.name}</p>
                    <p className="text-xs text-muted-foreground">{task.board_name}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {task.monday_url && (
                      <a href={task.monday_url} target="_blank" rel="noopener noreferrer" title="Open in Monday.com" className="text-muted-foreground hover:text-foreground transition-colors">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {task.dropbox_link && (
                      <a href={task.dropbox_link} target="_blank" rel="noopener noreferrer" title="Open Dropbox folder" className="text-blue-500 hover:text-blue-700 transition-colors">
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14.56L6.4 11.2 2 13.84 7.6 17.2 12 14.56zM12 14.56L17.6 17.2 22 13.84 17.6 11.2 12 14.56zM12 9.44L6.4 6.8 2 10.16 7.6 13.52 12 9.44zM17.6 6.8L12 9.44 17.6 13.52 22 10.16 17.6 6.8zM7.6 18.32L12 21 16.4 18.32 12 15.68 7.6 18.32z"/></svg>
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
