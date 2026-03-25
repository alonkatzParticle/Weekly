import { Suspense } from 'react'
import { HomeContent } from '@/components/HomeContent'
import { getTeamTasksData, getCurrentWeekStrings } from '@/lib/weeklyTasks'

export default async function Home() {
  const weeks = getCurrentWeekStrings()

  const { members, tasksByUser } = await getTeamTasksData(
    weeks.weekStart,
    weeks.weekEnd,
    weeks.nextWeekStart,
    weeks.nextWeekEnd
  ).catch(() => ({ members: [], tasksByUser: {} }))

  return (
    <Suspense>
      <HomeContent
        initialMembers={members}
        initialTasksByUser={tasksByUser}
        initialWeekStart={weeks.weekStart}
        initialWeekEnd={weeks.weekEnd}
        initialNextWeekStart={weeks.nextWeekStart}
        initialNextWeekEnd={weeks.nextWeekEnd}
        initialSelectedDate={weeks.selectedDate}
      />
    </Suspense>
  )
}
