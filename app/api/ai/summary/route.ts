import { NextRequest, NextResponse } from 'next/server'
import { generateSummaryStream, buildLastWeekPrompt, buildThisWeekPrompt } from '@/lib/anthropic'
import { getAISummary, saveAISummary, initDB } from '@/lib/db'
import { hashTasks } from '@/lib/tasks-hash'

export async function POST(req: NextRequest) {
  try {
    await initDB()
    const { memberId, memberName, tasks, type, weekEnding, regenerate } = await req.json()

    if (!['last_week', 'this_week'].includes(type)) {
      return NextResponse.json({ error: 'Invalid summary type' }, { status: 400 })
    }

    const tasksHash = tasks?.length ? hashTasks(tasks) : null

    // Serve cache if tasks haven't changed (or no tasks to hash)
    if (!regenerate) {
      const cached = await getAISummary(memberId, weekEnding, type)
      if (cached) {
        // If we have a hash and it matches, serve instantly
        if (!tasksHash || cached.tasks_hash === tasksHash) {
          return new Response(cached.content, { headers: { 'Content-Type': 'text/plain' } })
        }
        // Hash mismatch — tasks changed, fall through to regenerate
      }
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set in environment variables' }, { status: 500 })
    }

    if (!tasks || tasks.length === 0) {
      const msg = type === 'last_week'
        ? `No completed tasks found for ${memberName} last week.`
        : `No upcoming tasks found for ${memberName} this week.`
      await saveAISummary(memberId, weekEnding, type, msg, tasksHash ?? undefined)
      return new Response(msg, { headers: { 'Content-Type': 'text/plain' } })
    }

    const prompt = type === 'last_week'
      ? buildLastWeekPrompt(memberName, tasks)
      : buildThisWeekPrompt(memberName, tasks)

    const stream = await generateSummaryStream(prompt, apiKey)
    const [streamForResponse, streamForCache] = stream.tee()

    // Cache in background
    ;(async () => {
      const reader = streamForCache.getReader()
      const chunks: string[] = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(new TextDecoder().decode(value))
      }
      await saveAISummary(memberId, weekEnding, type, chunks.join(''), tasksHash ?? undefined).catch(console.error)
    })()

    return new Response(streamForResponse, {
      headers: { 'Content-Type': 'text/plain', 'Transfer-Encoding': 'chunked' },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
