import { Suspense } from 'react'
import { HomeContent } from '@/components/HomeContent'
import { getCurrentWeekStrings } from '@/lib/weeklyTasks'
import { initDB, getTeamMembers } from '@/lib/db'

export default async function Home() {
  const weeks = getCurrentWeekStrings()

  // Only fetch members from DB (fast). Tasks load client-side via /api/monday/team-tasks.
  await initDB().catch(() => {})
  const members = await getTeamMembers().catch(() => [])

  return (
    <Suspense>
      <HomeContent
        initialMembers={members}
        initialTasksByUser={{}}
        initialWeekStart={weeks.weekStart}
        initialWeekEnd={weeks.weekEnd}
        initialNextWeekStart={weeks.nextWeekStart}
        initialNextWeekEnd={weeks.nextWeekEnd}
        initialSelectedDate={weeks.selectedDate}
      />
    </Suspense>
  )
}
