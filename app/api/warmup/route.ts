import { NextResponse } from 'next/server'
import { initDB, getTeamMembers, getBoardIds, getAISummary, saveAISummary, getTeamAISummary, saveTeamAISummary } from '@/lib/db'
import { fetchTeamTasks, MondayTask } from '@/lib/monday'
import { generateSummary, buildLastWeekPrompt, buildThisWeekPrompt, buildStudioPrompt, buildTeamSummaryPrompt } from '@/lib/anthropic'
import { hashTasks, getWeekDates } from '@/lib/tasks-hash'

export const dynamic = 'force-dynamic'

async function warmupAll() {
  await initDB()

  const apiKey = process.env.ANTHROPIC_API_KEY
  const token = process.env.MONDAY_TOKEN
  if (!apiKey || !token) return { warmed: 0, skipped: 0, error: 'Missing API keys' }

  const [members, boards] = await Promise.all([getTeamMembers(), getBoardIds()])
  if (!members.length || !boards.length) return { warmed: 0, skipped: 0 }

  const boardIds = boards.map((b: any) => b.board_id)
  const { weekStart, weekEnd, nextWeekStart, nextWeekEnd, weekEnding } = getWeekDates()

  const validMembers = members.filter((m: any) => m.monday_user_id)
  const mondayUserIds = validMembers.map((m: any) => String(m.monday_user_id))

  // Fetch all tasks for all members in one shot (uses board cache)
  const rawByUser = await fetchTeamTasks(boardIds, mondayUserIds, token, weekStart, nextWeekEnd)

  // Split each user's flat task list into lastWeek / thisWeek the same way the route does
  const tasksByUser: Record<string, { lastWeek: MondayTask[], thisWeek: MondayTask[] }> = {}
  for (const userId of mondayUserIds) {
    const all = rawByUser[userId] ?? []
    tasksByUser[userId] = {
      lastWeek: all.filter(t => t.timeline_end && t.timeline_end >= weekStart && t.timeline_end <= weekEnd),
      thisWeek: all.filter(t => t.timeline_end && t.timeline_end >= nextWeekStart && t.timeline_end <= nextWeekEnd),
    }
  }

  let warmed = 0
  let skipped = 0

  // Per-member summaries: last_week, this_week, studio_last, studio_next
  for (const member of validMembers) {
    const userId = String(member.monday_user_id)
    const { lastWeek, thisWeek } = tasksByUser[userId]

    const jobs: Array<{ type: string; tasks: MondayTask[]; buildPrompt: () => string }> = [
      { type: 'last_week',   tasks: lastWeek, buildPrompt: () => buildLastWeekPrompt(member.name, lastWeek) },
      { type: 'this_week',   tasks: thisWeek, buildPrompt: () => buildThisWeekPrompt(member.name, thisWeek) },
      { type: 'studio_last', tasks: lastWeek, buildPrompt: () => buildStudioPrompt(member.name, lastWeek, 'studio_last') },
      { type: 'studio_next', tasks: thisWeek, buildPrompt: () => buildStudioPrompt(member.name, thisWeek, 'studio_next') },
    ]

    for (const job of jobs) {
      const tasksHash = job.tasks.length ? hashTasks(job.tasks) : null
      const cached = await getAISummary(member.id, weekEnding, job.type)

      if (cached && (!tasksHash || cached.tasks_hash === tasksHash)) {
        skipped++
        continue
      }

      try {
        let content: string
        if (!job.tasks.length) {
          content = job.type.includes('last')
            ? `No completed tasks found for ${member.name} last week.`
            : `No upcoming tasks found for ${member.name} this week.`
        } else {
          content = await generateSummary(job.buildPrompt(), apiKey)
        }
        await saveAISummary(member.id, weekEnding, job.type, content, tasksHash ?? undefined)
        warmed++
      } catch (e) {
        console.error(`[warmup] Failed ${member.name}/${job.type}:`, e)
      }
    }
  }

  // Team summary (last week)
  const teamTasks: Array<{ memberName: string; isVideoTeam: boolean; task: MondayTask }> = []
  for (const member of validMembers) {
    for (const task of tasksByUser[String(member.monday_user_id)].lastWeek) {
      teamTasks.push({ memberName: member.name, isVideoTeam: Boolean(member.is_video_team), task })
    }
  }

  const teamHash = teamTasks.length ? hashTasks(teamTasks.map(t => t.task)) : null
  const cachedTeam = await getTeamAISummary(weekEnding, 'team_last_week')

  if (!cachedTeam || (teamHash && cachedTeam.tasks_hash !== teamHash)) {
    try {
      const content = teamTasks.length
        ? await generateSummary(buildTeamSummaryPrompt(teamTasks), apiKey)
        : 'No completed tasks found for the team last week.'
      await saveTeamAISummary(weekEnding, 'team_last_week', content, teamHash ?? undefined)
      warmed++
    } catch (e) {
      console.error('[warmup] Failed team summary:', e)
    }
  } else {
    skipped++
  }

  console.log(`[warmup] Done — warmed: ${warmed}, skipped: ${skipped}`)
  return { warmed, skipped }
}

export async function GET() {
  // Fire in background — return immediately so the UI isn't blocked
  warmupAll().catch(console.error)
  return NextResponse.json({ status: 'warming up in background' })
}
