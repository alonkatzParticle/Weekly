import { NextRequest, NextResponse } from 'next/server'
import { generateSummary, buildTeamSummaryPrompt } from '@/lib/anthropic'
import { getTeamAISummary, saveTeamAISummary, initDB } from '@/lib/db'
import { hashTasks } from '@/lib/tasks-hash'

export async function POST(req: NextRequest) {
  try {
    await initDB()
    const { tasks, weekEnding, regenerate } = await req.json()

    // Hash the flat list of task objects for change detection
    const allTasks = (tasks ?? []).map((t: any) => t.task)
    const tasksHash = allTasks.length ? hashTasks(allTasks) : null

    if (!regenerate) {
      const cached = await getTeamAISummary(weekEnding, 'team_last_week')
      if (cached) {
        if (!tasksHash || cached.tasks_hash === tasksHash) {
          return new Response(cached.content, { headers: { 'Content-Type': 'text/plain' } })
        }
      }
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set in environment variables' }, { status: 500 })
    }

    if (!tasks || tasks.length === 0) {
      const msg = 'No completed tasks found for the team last week.'
      await saveTeamAISummary(weekEnding, 'team_last_week', msg, tasksHash ?? undefined)
      return new Response(msg, { headers: { 'Content-Type': 'text/plain' } })
    }

    const prompt = buildTeamSummaryPrompt(tasks)

    const content = await generateSummary(prompt, apiKey)
    await saveTeamAISummary(weekEnding, 'team_last_week', content, tasksHash ?? undefined).catch(console.error)
    return new Response(content, { headers: { 'Content-Type': 'text/plain' } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
