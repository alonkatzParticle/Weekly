import { NextRequest, NextResponse } from 'next/server'
import { generateSummaryStream, buildStudioPrompt } from '@/lib/anthropic'
import { getAISummary, saveAISummary, initDB } from '@/lib/db'
import { hashTasks } from '@/lib/tasks-hash'

export async function POST(req: NextRequest) {
  try {
    await initDB()
    const { memberId, memberName, tasks, type, weekEnding, regenerate } = await req.json()

    if (!['studio_last', 'studio_next'].includes(type)) {
      return NextResponse.json({ error: 'Invalid summary type' }, { status: 400 })
    }

    const tasksHash = tasks?.length ? hashTasks(tasks) : null

    if (!regenerate) {
      const cached = await getAISummary(memberId, weekEnding, type)
      if (cached) {
        if (!tasksHash || cached.tasks_hash === tasksHash) {
          return new Response(cached.content, { headers: { 'Content-Type': 'text/plain' } })
        }
      }
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })
    }

    if (!tasks || tasks.length === 0) {
      const msg = type === 'studio_last'
        ? `No completed tasks found for ${memberName} last week.`
        : `No upcoming tasks found for ${memberName} this week.`
      await saveAISummary(memberId, weekEnding, type, msg, tasksHash ?? undefined)
      return new Response(msg, { headers: { 'Content-Type': 'text/plain' } })
    }

    const prompt = buildStudioPrompt(memberName, tasks, type)
    const stream = await generateSummaryStream(prompt, apiKey)
    const [streamForResponse, streamForCache] = stream.tee()

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
