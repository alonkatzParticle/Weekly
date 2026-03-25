import { getBoardIds, getTeamMembers, initDB } from './db'
import { fetchTeamTasks, clearBoardCache, MondayTask } from './monday'
import { getWeekRange, getPreviousWeek, formatDate } from './utils'

export interface TeamMember {
  id: number
  name: string
  monday_user_id: string
  is_video_team: boolean
}

export type TasksByUser = Record<string, { lastWeek: MondayTask[]; thisWeek: MondayTask[] }>

export function getCurrentWeekStrings() {
  const now = new Date()
  const day = now.getDay()
  const thisSunday = new Date(now)
  thisSunday.setDate(now.getDate() - day)

  const thisWeek = getWeekRange(thisSunday)
  const lastWeek = getPreviousWeek(thisSunday)

  return {
    weekStart: formatDate(lastWeek.start),
    weekEnd: formatDate(lastWeek.end),
    nextWeekStart: formatDate(thisWeek.start),
    nextWeekEnd: formatDate(thisWeek.end),
    selectedDate: formatDate(thisSunday),
  }
}

export async function getTeamTasksData(
  weekStart: string,
  weekEnd: string,
  nextWeekStart: string,
  nextWeekEnd: string,
  force = false
): Promise<{ members: TeamMember[]; tasksByUser: TasksByUser }> {
  await initDB()

  const token = process.env.MONDAY_TOKEN
  if (!token) throw new Error('MONDAY_TOKEN not set')

  const [boards, members] = await Promise.all([getBoardIds(), getTeamMembers()])
  const boardIds = boards.map((b: any) => b.board_id)

  if (boardIds.length === 0 || members.length === 0) {
    return { members, tasksByUser: {} }
  }

  const validUserIds = members.map((m: any) => m.monday_user_id).filter(Boolean) as string[]

  if (force) clearBoardCache()

  const rawTasksByUser = await fetchTeamTasks(boardIds, validUserIds, token, weekStart, nextWeekEnd, force)

  const tasksByUser: TasksByUser = {}
  for (const m of members) {
    const allUserTasks = rawTasksByUser[m.monday_user_id] ?? []
    tasksByUser[m.monday_user_id] = {
      lastWeek: allUserTasks
        .filter(t => t.timeline_end && t.timeline_end >= weekStart && t.timeline_end <= weekEnd)
        .sort((a, b) => (a.timeline_end ?? '').localeCompare(b.timeline_end ?? '')),
      thisWeek: allUserTasks
        .filter(t => t.timeline_end && t.timeline_end >= nextWeekStart && t.timeline_end <= nextWeekEnd)
        .sort((a, b) => (a.timeline_end ?? '').localeCompare(b.timeline_end ?? '')),
    }
  }

  return { members, tasksByUser }
}
