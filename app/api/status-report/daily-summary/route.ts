import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })
    }

    const { completedToday = [], inProgress = [], date } = await req.json()

    const completedLines: string[] = (completedToday as any[]).map(t => {
      const assignees = (t.assignee_names as string[])?.join(', ') || 'Unassigned'
      return `- ${t.name} | Board: ${t.board_name} | Assignee: ${assignees} | Status: ${t.status}`
    })

    const inProgressLines: string[] = (inProgress as any[]).map(t => {
      const assignees = (t.assignee_names as string[])?.join(', ') || 'Unassigned'
      const due = t.timeline_end ? ` | Due: ${t.timeline_end}` : ''
      return `- ${t.name} | Board: ${t.board_name} | Assignee: ${assignees} | Status: ${t.status}${due}`
    })

    const prompt = `You are a creative studio manager writing a concise daily update for your boss.
Today is ${date}.

Write a brief, professional daily status update in markdown. Use this exact structure:

# Daily Update — ${date}

## Completed Today
[If no completed tasks, write "No tasks completed today." Otherwise bullet each task: **Task Name** — Assignee [Status]]

## In Progress
[Group by assignee using ### Assignee Name subsections. Each task: **Task Name** — brief status context [Status]. Skip assignees with no tasks.]

## Up Next
[2-3 bullet points about what to watch or expect tomorrow based on what's in progress]

Keep it tight and scannable. No fluff.

COMPLETED TODAY (${completedLines.length} tasks):
${completedLines.length > 0 ? completedLines.join('\n') : '(none)'}

IN PROGRESS (${inProgressLines.length} tasks):
${inProgressLines.length > 0 ? inProgressLines.join('\n') : '(none)'}

Daily Update:`

    const client = new Anthropic({ apiKey })
    const stream = await client.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
              controller.enqueue(new TextEncoder().encode(chunk.delta.text))
            }
          }
          controller.close()
        } catch (err) {
          controller.error(err)
        }
      }
    })

    return new Response(readable, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
