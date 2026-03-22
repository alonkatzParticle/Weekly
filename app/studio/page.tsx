'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import { WeekSelector } from '@/components/WeekSelector'
import { StudioMemberCard } from '@/components/StudioMemberCard'
import { TeamSummary } from '@/components/TeamSummary'
import { getWeekRange, getPreviousWeek, formatDate } from '@/lib/utils'
import type { MondayTask } from '@/lib/monday'

interface TeamMember {
  id: number
  name: string
  monday_user_id: string
  is_video_team: boolean
}

interface TaskCache {
  lastWeek: MondayTask[]
  thisWeek: MondayTask[]
  loaded: boolean
  error: string
}

export default function StudioPage() {
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date()
    const day = now.getDay()
    const thisSunday = new Date(now)
    thisSunday.setDate(now.getDate() - day)
    return thisSunday
  })

  const [members, setMembers] = useState<TeamMember[]>([])
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [taskCache, setTaskCache] = useState<Record<number, TaskCache>>({})

  const thisWeek = getWeekRange(selectedDate)
  const lastWeek = getPreviousWeek(selectedDate)

  const lastWeekStartStr = formatDate(lastWeek.start)
  const lastWeekEndStr = formatDate(lastWeek.end)
  const thisWeekStartStr = formatDate(thisWeek.start)
  const thisWeekEndStr = formatDate(thisWeek.end)

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => setMembers(d.members ?? []))
      .catch(console.error)
      .finally(() => setLoadingMembers(false))
  }, [])

  // Kick off background warmup on mount
  useEffect(() => { fetch('/api/warmup').catch(() => {}) }, [])

  const [refreshing, setRefreshing] = useState(false)

  const fetchAllTasks = useCallback((membersList: typeof members, force = false) => {
    if (membersList.length === 0) return
    setRefreshing(true)
    if (force) setTaskCache({}) // clear UI temporarily during hard refresh

    const url = `/api/monday/team-tasks?week_start=${lastWeekStartStr}&week_end=${lastWeekEndStr}&next_week_start=${thisWeekStartStr}&next_week_end=${thisWeekEndStr}${force ? '&force=true' : ''}`
    
    fetch(url)
      .then(r => r.json())
      .then(data => {
        const newCache: Record<number, TaskCache> = {}
        membersList.forEach(member => {
          const userTasks = data[member.monday_user_id] ?? { lastWeek: [], thisWeek: [] }
          newCache[member.id] = {
            lastWeek: userTasks.lastWeek,
            thisWeek: userTasks.thisWeek,
            loaded: true,
            error: '',
          }
        })
        setTaskCache(newCache)
      })
      .catch(err => {
        console.error('Failed to fetch team tasks:', err)
        const errCache: Record<number, TaskCache> = {}
        membersList.forEach(member => {
          errCache[member.id] = { lastWeek: [], thisWeek: [], loaded: false, error: 'Failed to load tasks' }
        })
        setTaskCache(errCache)
      })
      .finally(() => {
        setRefreshing(false)
      })
  }, [lastWeekStartStr, lastWeekEndStr, thisWeekStartStr, thisWeekEndStr])

  // Fetch tasks for all members whenever the week changes
  useEffect(() => {
    if (members.length === 0) return
    fetchAllTasks(members, false)
  }, [members, fetchAllTasks])

  const allTasksLoaded = members.length > 0 && members.every(m => !!taskCache[m.id]?.loaded)

  const teamTasks = useMemo(() =>
    members.flatMap(m =>
      (taskCache[m.id]?.lastWeek ?? []).map(task => ({
        memberName: m.name,
        isVideoTeam: m.is_video_team,
        task,
      }))
    ),
    // Only recompute when tasks are fully loaded or members change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allTasksLoaded, members, lastWeekEndStr]
  )

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Creative Studio</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Priority-focused overview across the whole team
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchAllTasks(members)}
            disabled={refreshing || loadingMembers}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title="Refresh tasks from Monday.com"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh Tasks'}
          </button>
          <WeekSelector selectedDate={selectedDate} onWeekChange={setSelectedDate} />
        </div>
      </div>

      {!loadingMembers && members.length > 0 && (
        <TeamSummary 
          weekEnd={lastWeekEndStr}
          tasks={teamTasks}
          tasksLoaded={allTasksLoaded}
        />
      )}

      {loadingMembers ? (
        <div className="text-sm text-muted-foreground animate-pulse">Loading team members...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {members.map(member => {
            const cache = taskCache[member.id]
            return (
              <StudioMemberCard
                key={member.id}
                member={member}
                lastWeekTasks={cache?.lastWeek ?? []}
                thisWeekTasks={cache?.thisWeek ?? []}
                tasksLoaded={cache?.loaded ?? false}
                weekEnd={lastWeekEndStr}
                nextWeekEnd={thisWeekEndStr}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
