'use client'
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { WeekSelector } from '@/components/WeekSelector'
import { TeamMemberTabs } from '@/components/TeamMemberTabs'
import { getWeekRange, getPreviousWeek, formatDate } from '@/lib/utils'
import type { TeamMember, TasksByUser } from '@/lib/weeklyTasks'

interface HomeContentProps {
  initialMembers: TeamMember[]
  initialTasksByUser: TasksByUser
  initialWeekStart: string
  initialWeekEnd: string
  initialNextWeekStart: string
  initialNextWeekEnd: string
  initialSelectedDate: string
}

export function HomeContent({
  initialMembers,
  initialTasksByUser,
  initialWeekStart,
  initialWeekEnd,
  initialNextWeekStart,
  initialNextWeekEnd,
  initialSelectedDate,
}: HomeContentProps) {
  const searchParams = useSearchParams()
  const initialMemberId = searchParams.get('member') ? Number(searchParams.get('member')) : undefined

  const [selectedDate, setSelectedDate] = useState(() => new Date(initialSelectedDate + 'T12:00:00'))

  const thisWeek = getWeekRange(selectedDate)
  const lastWeek = getPreviousWeek(selectedDate)

  const weekStart = formatDate(lastWeek.start)
  const weekEnd = formatDate(lastWeek.end)
  const nextWeekStart = formatDate(thisWeek.start)
  const nextWeekEnd = formatDate(thisWeek.end)

  // Use initial data only for the default week; other weeks fetch via API
  const isInitialWeek = weekStart === initialWeekStart
  const initialTasks = isInitialWeek ? initialTasksByUser : undefined

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Weekly Report</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Team performance overview and upcoming work
          </p>
        </div>
        <WeekSelector selectedDate={selectedDate} onWeekChange={setSelectedDate} />
      </div>

      <TeamMemberTabs
        key={`${initialMemberId ?? 'default'}-${weekStart}`}
        members={initialMembers}
        weekStart={weekStart}
        weekEnd={weekEnd}
        nextWeekStart={nextWeekStart}
        nextWeekEnd={nextWeekEnd}
        initialMemberId={initialMemberId}
        initialTasksByUser={initialTasks}
      />
    </div>
  )
}
