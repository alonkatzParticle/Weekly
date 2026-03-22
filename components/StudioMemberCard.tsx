'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { MondayTask } from '@/lib/monday'

interface Member {
  id: number
  name: string
  monday_user_id: string
  is_video_team: boolean
}

interface Props {
  member: Member
  lastWeekTasks: MondayTask[]
  thisWeekTasks: MondayTask[]
  tasksLoaded: boolean
  weekEnd: string       // Saturday of last week (for caching)
  nextWeekEnd: string   // Saturday of this week
}

function SummarySection({
  label,
  memberId,
  memberName,
  tasks,
  tasksLoaded,
  weekEnding,
  type,
}: {
  label: string
  memberId: number
  memberName: string
  tasks: MondayTask[]
  tasksLoaded: boolean
  weekEnding: string
  type: 'studio_last' | 'studio_next'
}) {
  const [summary, setSummary] = useState('')
  const [loading, setLoading] = useState(false)
  const fetchedRef = useRef<string | null>(null)
  const key = `${memberId}-${weekEnding}-${type}`

  const fetchSummary = useCallback(async (regenerate = false) => {
    setLoading(true)
    setSummary('')
    try {
      const res = await fetch('/api/ai/studio-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, memberName, tasks, type, weekEnding: weekEnding, regenerate }),
      })
      if (!res.ok) throw new Error('Failed')
      const reader = res.body?.getReader()
      if (!reader) return
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        setSummary(prev => prev + new TextDecoder().decode(value))
      }
    } catch {
      setSummary('Unable to generate summary.')
    } finally {
      setLoading(false)
    }
  }, [memberId, memberName, tasks, weekEnding, type])

  useEffect(() => {
    if (tasksLoaded && fetchedRef.current !== key) {
      fetchedRef.current = key
      fetchSummary()
    }
  }, [tasksLoaded, key]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
        <button
          onClick={() => fetchSummary(true)}
          disabled={loading}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Regenerate"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {loading ? (
        <div className="space-y-1.5">
          <div className="h-3 bg-muted animate-pulse rounded w-full" />
          <div className="h-3 bg-muted animate-pulse rounded w-5/6" />
          <div className="h-3 bg-muted animate-pulse rounded w-4/5" />
        </div>
      ) : (
        <div className="text-sm leading-relaxed text-foreground space-y-1">
          {summary
            ? summary.split('\n').filter(line => line.trim()).map((line, i) => (
                <p key={i}>{line}</p>
              ))
            : (!tasksLoaded ? null : <p>No tasks found.</p>)
          }
        </div>
      )}
    </div>
  )
}

export function StudioMemberCard({ member, lastWeekTasks, thisWeekTasks, tasksLoaded, weekEnd, nextWeekEnd }: Props) {
  const initials = member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-3 text-base">
          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
            {initials}
          </div>
          <span className="truncate">{member.name}</span>
          {member.is_video_team && (
            <span className="ml-auto text-[10px] font-medium bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full shrink-0">
              Video
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 flex-1">
        <SummarySection
          label="Last Week"
          memberId={member.id}
          memberName={member.name}
          tasks={lastWeekTasks}
          tasksLoaded={tasksLoaded}
          weekEnding={weekEnd}
          type="studio_last"
        />
        <div className="border-t" />
        <SummarySection
          label="This Week"
          memberId={member.id}
          memberName={member.name}
          tasks={thisWeekTasks}
          tasksLoaded={tasksLoaded}
          weekEnding={nextWeekEnd}
          type="studio_next"
        />
      </CardContent>
    </Card>
  )
}
