'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useBackgroundSync } from '@/hooks/useBackgroundSync'
import { RefreshCw, Copy, Check, Sparkles, Loader2, ExternalLink, ArrowUpDown, Pencil, Eye } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import type { StatusTask, TasksByBoard } from '@/lib/statusReport'

interface DailyTask {
  id: string
  name: string
  board_name: string
  assignee_ids: string[]
  assignee_names: string[]
  status: string
  status_color: string | null
  timeline_end: string | null
  monday_url: string | null
}

type SortKey = 'priority' | 'timeline'
type ActiveTab = 'boss' | 'daily'

interface InitialData {
  tasksByBoard: TasksByBoard
  completedToday: StatusTask[]
}

const PRIORITY_BADGE: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border border-red-200',
  high: 'bg-orange-100 text-orange-700 border border-orange-200',
  medium: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
}

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2 }

function priorityBadge(priority: string) {
  return PRIORITY_BADGE[priority.toLowerCase()] ?? 'bg-gray-100 text-gray-500 border border-gray-200'
}

const STATUS_COLORS: { match: RegExp; classes: string }[] = [
  { match: /done|complet|finish/i,          classes: 'bg-green-100 text-green-700 border border-green-200' },
  { match: /stuck|blocked|problem|issue/i,  classes: 'bg-red-100 text-red-700 border border-red-200' },
  { match: /review|approval|feedback/i,     classes: 'bg-purple-100 text-purple-700 border border-purple-200' },
  { match: /progress|working|active/i,      classes: 'bg-blue-100 text-blue-700 border border-blue-200' },
  { match: /wait|hold|pending/i,            classes: 'bg-yellow-100 text-yellow-700 border border-yellow-200' },
  { match: /.*/,                            classes: 'bg-gray-100 text-gray-600 border border-gray-200' },
]

function statusBadge(status: string) {
  return STATUS_COLORS.find(s => s.match.test(status))!.classes
}

const SECTION_STYLES: { match: RegExp; card: string; label: string; dot: string }[] = [
  { match: /complet/i,  card: 'bg-green-50 border-green-200', label: 'text-green-700', dot: 'bg-green-400' },
  { match: /critical/i, card: 'bg-red-50 border-red-200',     label: 'text-red-700',   dot: 'bg-red-400' },
  { match: /next/i,     card: 'bg-blue-50 border-blue-200',   label: 'text-blue-700',  dot: 'bg-blue-400' },
  { match: /.*/,        card: 'bg-gray-50 border-gray-200',   label: 'text-gray-600',  dot: 'bg-gray-400' },
]

function getSectionStyle(heading: string) {
  return SECTION_STYLES.find(s => s.match.test(heading))!
}

// Pre-process markdown: convert [Status Text] → `Status Text` so we can style it via the code renderer
function preprocessMarkdown(text: string): string {
  return text.replace(/\[([^\]]+)\]/g, '`$1`')
}

function statusCodeBadge(text: string, colorMap: Record<string, string>) {
  const hex = colorMap[text.toLowerCase()]
  if (hex) {
    return (
      <span
        className="inline-block text-[11px] px-1.5 py-0.5 rounded font-medium"
        style={{ backgroundColor: hex + '22', color: hex, border: `1px solid ${hex}55` }}
      >
        {text}
      </span>
    )
  }
  return <span className={`inline-block text-[11px] px-1.5 py-0.5 rounded font-medium ${statusBadge(text)}`}>{text}</span>
}

const baseComponents = (dotColor: string, colorMap: Record<string, string>): React.ComponentProps<typeof ReactMarkdown>['components'] => ({
  h3:     ({ children }) => <p className="text-xs font-semibold text-gray-800 mt-2 mb-0.5">{children}</p>,
  p:      ({ children }) => <p className="text-xs text-gray-600 leading-relaxed mb-1">{children}</p>,
  ul:     ({ children }) => <ul className="space-y-1">{children}</ul>,
  li:     ({ children }) => (
    <li className="flex gap-2 text-xs text-gray-700 leading-snug">
      <span className={`mt-[5px] h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`} />
      <span>{children}</span>
    </li>
  ),
  code:   ({ children }) => statusCodeBadge(String(children), colorMap),
  strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
  hr:     () => null,
})

const inProgressComponents = (dotColor: string, colorMap: Record<string, string>): React.ComponentProps<typeof ReactMarkdown>['components'] => ({
  ...baseComponents(dotColor, colorMap),
  h3: ({ children }) => (
    <p className="text-sm font-bold text-gray-900 mt-4 mb-1 first:mt-0">{children}</p>
  ),
  h4: ({ children }) => (
    <p className="text-xs font-semibold text-gray-700 mt-2 mb-0.5 ml-2">{children}</p>
  ),
  ul: ({ children }) => <ul className="space-y-1 ml-4">{children}</ul>,
  li: ({ children }) => (
    <li className="flex gap-2 text-xs text-gray-600 leading-snug">
      <span className={`mt-[5px] h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`} />
      <span>{children}</span>
    </li>
  ),
})

function MarkdownReport({ text, colorMap }: { text: string; colorMap: Record<string, string> }) {
  const rawSections = text.split(/^(?=## )/m)
  const title = rawSections[0].replace(/^#\s+/, '').trim()
  const sections = rawSections.slice(1).map(block => {
    const [headingLine, ...rest] = block.split('\n')
    return { heading: headingLine.replace(/^##\s+/, '').trim(), content: rest.join('\n').trim() }
  })

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-2">
      {title && <p className="text-xs font-medium text-gray-400 px-1 pb-0.5">{title}</p>}
      {sections.map(({ heading, content }) => {
        const style = getSectionStyle(heading)
        const components = /progress/i.test(heading)
          ? inProgressComponents(style.dot, colorMap)
          : baseComponents(style.dot, colorMap)
        return (
          <div key={heading} className={`rounded-lg border px-3 pt-2.5 pb-3 ${style.card}`}>
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${style.label}`}>{heading}</p>
            <ReactMarkdown components={components}>{preprocessMarkdown(content)}</ReactMarkdown>
          </div>
        )
      })}
    </div>
  )
}

function sortTasks(tasks: StatusTask[], sortKey: SortKey): StatusTask[] {
  return [...tasks].sort((a, b) => {
    if (sortKey === 'priority') {
      return (PRIORITY_ORDER[a.priority.toLowerCase()] ?? 3) - (PRIORITY_ORDER[b.priority.toLowerCase()] ?? 3)
    }
    // Sort by timeline_end: tasks with a date first (ascending), then tasks with no date
    if (!a.timeline_end && !b.timeline_end) return 0
    if (!a.timeline_end) return 1
    if (!b.timeline_end) return -1
    return a.timeline_end.localeCompare(b.timeline_end)
  })
}

export default function StatusReportClient({ initialData }: { initialData: InitialData }) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('boss')

  // Boss Update state
  const [tasksByBoard, setTasksByBoard] = useState<TasksByBoard>(initialData.tasksByBoard)
  const [completedToday, setCompletedToday] = useState<StatusTask[]>(initialData.completedToday)
  const [loading, setLoading] = useState(false)
  const [summaryText, setSummaryText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('priority')
  const [editMode, setEditMode] = useState(false)

  // Daily Update state
  const [dailyCompleted, setDailyCompleted] = useState<DailyTask[]>([])
  const [dailyInProgress, setDailyInProgress] = useState<DailyTask[]>([])
  const [dailyDate, setDailyDate] = useState('')
  const [dailyLoading, setDailyLoading] = useState(false)
  const [dailySummaryText, setDailySummaryText] = useState('')
  const [dailyGenerating, setDailyGenerating] = useState(false)
  const [dailyCopied, setDailyCopied] = useState(false)
  const [dailyError, setDailyError] = useState<string | null>(null)
  const [dailyEditMode, setDailyEditMode] = useState(false)

  const fetchTasks = useCallback(async (force = false, silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/status-report${force ? '?force=true' : ''}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setTasksByBoard(data.tasksByBoard ?? {})
      setCompletedToday(data.completedToday ?? [])
    } catch (e: any) {
      if (!silent) setError(e.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useBackgroundSync(() => fetchTasks(false, true))

  // Auto-fetch on mount if no initial data was provided
  useEffect(() => {
    if (Object.keys(initialData.tasksByBoard).length === 0) {
      fetchTasks()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sortedTasksByBoard = useMemo(() => {
    const result: TasksByBoard = {}
    for (const board of Object.keys(tasksByBoard)) {
      result[board] = sortTasks(tasksByBoard[board], sortKey)
    }
    return result
  }, [tasksByBoard, sortKey])

  const generateSummary = async () => {
    setGenerating(true)
    setSummaryText('')
    try {
      const res = await fetch('/api/status-report/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasksByBoard, completedToday }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to generate summary' }))
        throw new Error(err.error ?? 'Failed to generate summary')
      }
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let text = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
        setSummaryText(text)
      }
    } catch (e: any) {
      setSummaryText(`Error: ${e.message}`)
    } finally {
      setGenerating(false)
    }
  }

  const fetchDailyTasks = useCallback(async (force = false) => {
    setDailyLoading(true)
    setDailyError(null)
    try {
      const res = await fetch(`/api/status-report/daily${force ? '?force=true' : ''}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setDailyCompleted(data.completedToday ?? [])
      setDailyInProgress(data.inProgress ?? [])
      setDailyDate(data.date ?? '')
    } catch (e: any) {
      setDailyError(e.message)
    } finally {
      setDailyLoading(false)
    }
  }, [])

  const generateDailySummary = async () => {
    setDailyGenerating(true)
    setDailySummaryText('')
    try {
      const res = await fetch('/api/status-report/daily-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completedToday: dailyCompleted, inProgress: dailyInProgress, date: dailyDate }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to generate summary' }))
        throw new Error(err.error ?? 'Failed to generate summary')
      }
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let text = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
        setDailySummaryText(text)
      }
    } catch (e: any) {
      setDailySummaryText(`Error: ${e.message}`)
    } finally {
      setDailyGenerating(false)
    }
  }

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(summaryText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => {
    if (activeTab === 'daily' && dailyCompleted.length === 0 && dailyInProgress.length === 0 && !dailyLoading) {
      fetchDailyTasks()
    }
  }, [activeTab, dailyCompleted.length, dailyInProgress.length, dailyLoading, fetchDailyTasks])

  const copyDailyToClipboard = async () => {
    await navigator.clipboard.writeText(dailySummaryText)
    setDailyCopied(true)
    setTimeout(() => setDailyCopied(false), 2000)
  }

  const statusColorMap = useMemo(() => {
    const map: Record<string, string> = {}
    const allTasks = [...Object.values(tasksByBoard).flat(), ...completedToday]
    for (const t of allTasks) {
      if (t.status && t.status_color) map[t.status.toLowerCase()] = t.status_color
    }
    return map
  }, [tasksByBoard, completedToday])

  const dailyColorMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const t of [...dailyCompleted, ...dailyInProgress]) {
      if (t.status && t.status_color) map[t.status.toLowerCase()] = t.status_color
    }
    return map
  }, [dailyCompleted, dailyInProgress])

  const totalTasks = Object.values(tasksByBoard).reduce((sum, tasks) => sum + tasks.length, 0)
  const boards = Object.keys(sortedTasksByBoard).sort()

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-white shrink-0">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-semibold">Status Report</h1>
            {activeTab === 'boss' && !loading && (
              <p className="text-sm text-muted-foreground">
                {totalTasks} open high/critical priority {totalTasks === 1 ? 'task' : 'tasks'}
              </p>
            )}
            {activeTab === 'daily' && !dailyLoading && (
              <p className="text-sm text-muted-foreground">
                {dailyCompleted.length} completed · {dailyInProgress.length} in progress
              </p>
            )}
          </div>
          {/* Tab switcher */}
          <div className="flex items-center border rounded-md overflow-hidden text-xs">
            <button
              onClick={() => setActiveTab('boss')}
              className={`px-3 py-1.5 transition-colors ${activeTab === 'boss' ? 'bg-black text-white' : 'hover:bg-muted/50'}`}
            >
              Boss Update
            </button>
            <button
              onClick={() => setActiveTab('daily')}
              className={`px-3 py-1.5 transition-colors ${activeTab === 'daily' ? 'bg-black text-white' : 'hover:bg-muted/50'}`}
            >
              Daily Update
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'boss' && (
            <div className="flex items-center gap-1 border rounded-md overflow-hidden text-xs">
              <span className="pl-2 pr-1 text-muted-foreground flex items-center gap-1">
                <ArrowUpDown className="h-3 w-3" /> Sort
              </span>
              <button
                onClick={() => setSortKey('priority')}
                className={`px-2.5 py-1.5 transition-colors ${sortKey === 'priority' ? 'bg-black text-white' : 'hover:bg-muted/50'}`}
              >
                Priority
              </button>
              <button
                onClick={() => setSortKey('timeline')}
                className={`px-2.5 py-1.5 transition-colors ${sortKey === 'timeline' ? 'bg-black text-white' : 'hover:bg-muted/50'}`}
              >
                Due Date
              </button>
            </div>
          )}
          <button
            onClick={() => activeTab === 'boss' ? fetchTasks(true) : fetchDailyTasks(true)}
            disabled={activeTab === 'boss' ? loading : dailyLoading}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm border hover:bg-muted/50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${(activeTab === 'boss' ? loading : dailyLoading) ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {(error || dailyError) && (
        <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700 shrink-0">
          {activeTab === 'boss' ? error : dailyError}
        </div>
      )}

      {/* Two-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Task Lists */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {activeTab === 'daily' ? (
            /* Daily Update left panel */
            dailyLoading ? (
              <div className="space-y-5">
                {[1, 2].map(i => (
                  <div key={i} className="animate-pulse space-y-2">
                    <div className="h-3 bg-gray-200 rounded w-1/4 mb-3" />
                    {[1, 2, 3].map(j => <div key={j} className="h-14 bg-gray-100 rounded-lg" />)}
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                {dailyCompleted.length > 0 && (
                  <div>
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-green-600 mb-2 px-1">
                      Completed Today ({dailyCompleted.length})
                    </h2>
                    <div className="space-y-2">
                      {dailyCompleted.map(task => (
                        <div key={task.id} className="flex items-start gap-3 p-3 rounded-lg border bg-green-50 border-green-100">
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-sm">{task.name}</span>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              {task.status && (
                                <span
                                  className="text-xs px-1.5 py-0.5 rounded font-medium"
                                  style={task.status_color
                                    ? { backgroundColor: task.status_color + '22', color: task.status_color, border: `1px solid ${task.status_color}55` }
                                    : undefined}
                                >
                                  {task.status}
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground">{task.board_name}</span>
                              {task.assignee_names.length > 0 && (
                                <span className="text-xs text-muted-foreground">{task.assignee_names.join(', ')}</span>
                              )}
                            </div>
                          </div>
                          {task.monday_url && (
                            <a href={task.monday_url} target="_blank" rel="noopener noreferrer"
                              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {dailyCompleted.length === 0 && !dailyLoading && (
                  <div className="p-3 rounded-lg border bg-gray-50 text-sm text-muted-foreground">
                    No completed tasks detected today via activity logs.
                  </div>
                )}
                {dailyInProgress.length > 0 && (
                  <div>
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                      In Progress ({dailyInProgress.length})
                    </h2>
                    <div className="space-y-2">
                      {dailyInProgress.map(task => (
                        <div key={task.id} className="flex items-start gap-3 p-3 rounded-lg border bg-white hover:bg-muted/20 transition-colors">
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-sm">{task.name}</span>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              {task.status && (
                                <span
                                  className="text-xs px-1.5 py-0.5 rounded font-medium"
                                  style={task.status_color
                                    ? { backgroundColor: task.status_color + '22', color: task.status_color, border: `1px solid ${task.status_color}55` }
                                    : undefined}
                                >
                                  {task.status}
                                </span>
                              )}
                              {task.timeline_end && (
                                <span className="text-xs text-muted-foreground">Due {task.timeline_end}</span>
                              )}
                              <span className="text-xs text-muted-foreground">{task.board_name}</span>
                              {task.assignee_names.length > 0 && (
                                <span className="text-xs text-muted-foreground">{task.assignee_names.join(', ')}</span>
                              )}
                            </div>
                          </div>
                          {task.monday_url && (
                            <a href={task.monday_url} target="_blank" rel="noopener noreferrer"
                              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          ) : loading ? (
            <div className="space-y-5">
              {[1, 2].map(i => (
                <div key={i} className="animate-pulse space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-1/4 mb-3" />
                  {[1, 2, 3].map(j => (
                    <div key={j} className="h-14 bg-gray-100 rounded-lg" />
                  ))}
                </div>
              ))}
            </div>
          ) : boards.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-20">
              <p className="font-medium">No open tasks found</p>
              <p className="text-sm mt-1">No high or critical priority incomplete tasks across configured boards.</p>
            </div>
          ) : (
            boards.map(board => (
              <div key={board}>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                  {board} <span className="font-normal normal-case">({sortedTasksByBoard[board].length})</span>
                </h2>
                <div className="space-y-2">
                  {sortedTasksByBoard[board].map(task => (
                    <div
                      key={task.id}
                      className="flex items-start gap-3 p-3 rounded-lg border bg-white hover:bg-muted/20 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{task.name}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${priorityBadge(task.priority)}`}>
                            {task.priority}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {task.status && (
                            <span
                              className="text-xs px-1.5 py-0.5 rounded font-medium"
                              style={task.status_color
                                ? { backgroundColor: task.status_color + '22', color: task.status_color, border: `1px solid ${task.status_color}55` }
                                : undefined}
                            >
                              {task.status}
                            </span>
                          )}
                          {task.timeline_end && (
                            <span className="text-xs text-muted-foreground">
                              Due {task.timeline_end}
                            </span>
                          )}
                          {task.assignee_names.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {task.assignee_names.join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                      {task.monday_url && (
                        <a
                          href={task.monday_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
                          title="Open in Monday.com"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Right: Summary Panel */}
        <div className="w-[460px] border-l flex flex-col bg-gray-50 shrink-0">
          {activeTab === 'boss' ? (
            <>
              <div className="px-4 py-3 border-b bg-white flex items-center justify-between shrink-0">
                <span className="text-sm font-medium">Boss Update</span>
                <div className="flex items-center gap-2">
                  {summaryText && !generating && (
                    <button
                      onClick={() => setEditMode(e => !e)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border bg-white hover:bg-muted/50 transition-colors"
                    >
                      {editMode ? <Eye className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                      {editMode ? 'Preview' : 'Edit'}
                    </button>
                  )}
                  <button
                    onClick={copyToClipboard}
                    disabled={!summaryText}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border bg-white hover:bg-muted/50 disabled:opacity-40 transition-colors"
                  >
                    {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    onClick={generateSummary}
                    disabled={generating || loading || boards.length === 0}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs bg-black text-white hover:bg-gray-800 disabled:opacity-40 transition-colors"
                  >
                    {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    {generating ? 'Generating...' : 'Generate'}
                  </button>
                </div>
              </div>
              {editMode ? (
                <textarea
                  className="flex-1 p-4 text-sm bg-gray-50 resize-none focus:outline-none focus:bg-white transition-colors"
                  value={summaryText}
                  onChange={e => setSummaryText(e.target.value)}
                  autoFocus
                />
              ) : summaryText ? (
                <MarkdownReport text={summaryText} colorMap={statusColorMap} />
              ) : (
                <div className="flex-1 p-4 text-sm text-muted-foreground/60">
                  Click &apos;Generate&apos; to create a brief status update for your boss. You can edit the text before copying.
                </div>
              )}
            </>
          ) : (
            <>
              <div className="px-4 py-3 border-b bg-white flex items-center justify-between shrink-0">
                <span className="text-sm font-medium">Daily Summary</span>
                <div className="flex items-center gap-2">
                  {dailySummaryText && !dailyGenerating && (
                    <button
                      onClick={() => setDailyEditMode(e => !e)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border bg-white hover:bg-muted/50 transition-colors"
                    >
                      {dailyEditMode ? <Eye className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                      {dailyEditMode ? 'Preview' : 'Edit'}
                    </button>
                  )}
                  <button
                    onClick={copyDailyToClipboard}
                    disabled={!dailySummaryText}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border bg-white hover:bg-muted/50 disabled:opacity-40 transition-colors"
                  >
                    {dailyCopied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                    {dailyCopied ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    onClick={generateDailySummary}
                    disabled={dailyGenerating || dailyLoading}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs bg-black text-white hover:bg-gray-800 disabled:opacity-40 transition-colors"
                  >
                    {dailyGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    {dailyGenerating ? 'Generating...' : 'Generate'}
                  </button>
                </div>
              </div>
              {dailyEditMode ? (
                <textarea
                  className="flex-1 p-4 text-sm bg-gray-50 resize-none focus:outline-none focus:bg-white transition-colors"
                  value={dailySummaryText}
                  onChange={e => setDailySummaryText(e.target.value)}
                  autoFocus
                />
              ) : dailySummaryText ? (
                <MarkdownReport text={dailySummaryText} colorMap={dailyColorMap} />
              ) : (
                <div className="flex-1 p-4 text-sm text-muted-foreground/60">
                  Click &apos;Generate&apos; to create a daily update for your boss based on today&apos;s activity.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
