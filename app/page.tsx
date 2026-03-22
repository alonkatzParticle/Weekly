'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { WeekSelector } from '@/components/WeekSelector'
import { TeamMemberTabs } from '@/components/TeamMemberTabs'
import { getWeekRange, getPreviousWeek, formatDate } from '@/lib/utils'

interface TeamMember {
  id: number
  name: string
  monday_user_id: string
  is_video_team: boolean
}

function HomeContent() {
  const searchParams = useSearchParams()
  const initialMemberId = searchParams.get('member') ? Number(searchParams.get('member')) : undefined

  const [selectedDate, setSelectedDate] = useState(() => {
    // Default to the current week. The selector represents "this week":
    //   Left panel (Last Week Summary) = previous week
    //   Right panel (This Week Preview) = selected week
    const now = new Date()
    const day = now.getDay() // 0=Sun
    const thisSunday = new Date(now)
    thisSunday.setDate(now.getDate() - day)
    return thisSunday
  })

  const [members, setMembers] = useState<TeamMember[]>([])
  const [loadingMembers, setLoadingMembers] = useState(true)

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => setMembers(d.members ?? []))
      .catch(console.error)
      .finally(() => setLoadingMembers(false))
  }, [])

  // Kick off background warmup on mount — pre-fetches tasks and pre-caches all summaries
  useEffect(() => { fetch('/api/warmup').catch(() => {}) }, [])

  // Selected week = "This Week" (right panel)
  const thisWeek = getWeekRange(selectedDate)
  // Previous week = "Last Week" (left panel)
  const lastWeek = getPreviousWeek(selectedDate)

  const lastWeekStartStr = formatDate(lastWeek.start)
  const lastWeekEndStr = formatDate(lastWeek.end)
  const thisWeekStartStr = formatDate(thisWeek.start)
  const thisWeekEndStr = formatDate(thisWeek.end)

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

      {loadingMembers ? (
        <div className="text-sm text-muted-foreground animate-pulse">Loading team members...</div>
      ) : (
        <TeamMemberTabs
          key={initialMemberId ?? 'default'}
          members={members}
          weekStart={lastWeekStartStr}
          weekEnd={lastWeekEndStr}
          nextWeekStart={thisWeekStartStr}
          nextWeekEnd={thisWeekEndStr}
          initialMemberId={initialMemberId}
        />
      )}
    </div>
  )
}

export default function Home() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  )
}
