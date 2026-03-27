'use client'
import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { LastWeekSummary } from './LastWeekSummary'
import { ThisWeekPreview } from './ThisWeekPreview'
import { TimeTracking } from './TimeTracking'
import { WorkSampleUpload } from './WorkSampleUpload'
import { WeeklyFilesPreview } from './WeeklyFilesPreview'
import type { MondayTask } from '@/lib/monday'

interface TeamMember {
  id: number
  name: string
  monday_user_id: string
  is_video_team: boolean
}

interface TeamMemberTabsProps {
  members: TeamMember[]
  weekStart: string
  weekEnd: string
  nextWeekStart: string
  nextWeekEnd: string
  initialMemberId?: number
  initialTasksByUser?: Record<string, { lastWeek: MondayTask[]; thisWeek: MondayTask[] }>
}

export function TeamMemberTabs({
  members,
  weekStart,
  weekEnd,
  nextWeekStart,
  nextWeekEnd,
  initialMemberId,
  initialTasksByUser,
}: TeamMemberTabsProps) {
  const [activeTab, setActiveTab] = useState(() => {
    if (initialMemberId && members.some(m => m.id === initialMemberId)) return initialMemberId
    return members[0]?.id ?? 0
  })
  const [tasksByMember, setTasksByMember] = useState<
    Record<string, { lastWeek: MondayTask[]; thisWeek: MondayTask[]; loaded: boolean; error: string }>
  >(() => {
    if (!initialTasksByUser) return {}
    const initial: Record<string, { lastWeek: MondayTask[]; thisWeek: MondayTask[]; loaded: boolean; error: string }> = {}
    for (const m of members) {
      const data = initialTasksByUser[m.monday_user_id]
      if (data) {
        initial[`${m.monday_user_id}-${weekStart}`] = { ...data, loaded: true, error: '' }
      }
    }
    return initial
  })

  const activeMember = members.find(m => m.id === activeTab) ?? members[0]

  const fetchAllTasks = useCallback(
    async (force = false) => {
      if (!force) {
        // If we already have the active member's data for this week, we don't need to fetch again
        const cacheKey = activeMember ? `${activeMember.monday_user_id}-${weekStart}` : ''
        if (tasksByMember[cacheKey]?.loaded) return
      }

      if (force) setTasksByMember({})

      try {
        const res = await fetch(
          `/api/monday/team-tasks?week_start=${weekStart}&week_end=${weekEnd}&next_week_start=${nextWeekStart}&next_week_end=${nextWeekEnd}${force ? '&force=true' : ''}`
        )
        const data = await res.json()
        if (data.error) throw new Error(data.error)

        const newTasks: typeof tasksByMember = {}
        members.forEach(m => {
          const userTasks = data[m.monday_user_id] ?? { lastWeek: [], thisWeek: [] }
          newTasks[`${m.monday_user_id}-${weekStart}`] = {
            lastWeek: userTasks.lastWeek,
            thisWeek: userTasks.thisWeek,
            loaded: true,
            error: '',
          }
        })
        setTasksByMember(newTasks)
      } catch (err) {
        const errTasks: typeof tasksByMember = {}
        members.forEach(m => {
          errTasks[`${m.monday_user_id}-${weekStart}`] = {
            lastWeek: [],
            thisWeek: [],
            loaded: true,
            error: String(err),
          }
        })
        setTasksByMember(errTasks)
      }
    },
    [weekStart, weekEnd, nextWeekStart, nextWeekEnd, members, activeMember, tasksByMember]
  )

  useEffect(() => {
    if (members.length > 0) {
      fetchAllTasks(false)
    }
  }, [weekStart, members]) // eslint-disable-line react-hooks/exhaustive-deps

  if (members.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No team members configured. Go to Settings to add team members.
      </div>
    )
  }

  const cacheKey = activeMember ? `${activeMember.monday_user_id}-${weekStart}` : ''
  const memberData = tasksByMember[cacheKey]
  const tasksLoaded = memberData?.loaded ?? false
  const lastWeekTasks = memberData?.lastWeek ?? []
  const thisWeekTasks = memberData?.thisWeek ?? []
  const tasksError = memberData?.error ?? ''

  return (
    <div>
      {/* Tab List */}
      <div className="flex gap-1 border-b mb-6 overflow-x-auto">
        {members.map(member => (
          <button
            key={member.id}
            onClick={() => setActiveTab(member.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
              activeTab === member.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground'
            )}
          >
            {member.name}
            {member.is_video_team && (
              <span className="ml-1.5 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                Video
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeMember && (
        <div className="space-y-6">
        <WeeklyFilesPreview
          memberName={activeMember.name}
          weekEnding={weekEnd}
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            {/* <LastWeekSummary
              memberId={activeMember.id}
              memberName={activeMember.name}
              weekEnd={weekEnd}
              tasks={lastWeekTasks}
              tasksLoaded={tasksLoaded}
              tasksError={tasksError}
              onRefreshTasks={() => fetchAllTasks(true)}
            /> */}
            {activeMember.is_video_team && (
              <TimeTracking
                mondayUserId={activeMember.monday_user_id}
                weekStart={weekStart}
                weekEnd={weekEnd}
              />
            )}
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* <ThisWeekPreview
              memberId={activeMember.id}
              memberName={activeMember.name}
              weekEnd={nextWeekEnd}
              tasks={thisWeekTasks}
              tasksLoaded={tasksLoaded}
              tasksError={tasksError}
              onRefreshTasks={() => fetchAllTasks(true)}
            /> */}
            <WorkSampleUpload memberName={activeMember.name} weekEnding={weekEnd} />
          </div>
        </div>
        </div>
      )}
    </div>
  )
}
