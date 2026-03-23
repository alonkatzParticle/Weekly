import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })
    }

    const { tasksByBoard, completedToday = [] } = await req.json()

    const lines: string[] = []
    for (const [board, tasks] of Object.entries(tasksByBoard as Record<string, any[]>)) {
      lines.push(`\n**${board}**`)
      for (const t of tasks) {
        const assignees = (t.assignee_names as string[])?.join(', ') || 'Unassigned'
        lines.push(`- ${t.name} | Priority: ${t.priority} | Status: ${t.status} | Assigned: ${assignees}`)
      }
    }

    const completedLines: string[] = []
    for (const t of completedToday as any[]) {
      const assignees = (t.assignee_names as string[])?.join(', ') || 'Unassigned'
      completedLines.push(`- ${t.name} | Board: ${t.board_name} | Assigned: ${assignees}`)
    }

    const completedSection = completedLines.length > 0
      ? `\nCompleted today (high/critical tasks closed out):\n${completedLines.join('\n')}`
      : ''

    const prompt = `You are a creative studio manager writing a brief status update for your boss.

Below are the high and critical priority tasks currently open, plus any high/critical tasks completed today. Write a concise, professional status update using markdown. Structure it with these sections:
- # [title]
- ## Completed Today — only if there are completed tasks; celebrate wins briefly
- ## Critical Items — only if any critical priority tasks exist; flag urgency clearly
- ## In Progress — a tight summary of open high-priority work grouped by board
- ## Next Steps — 2-3 action items max

Keep it scannable and direct. This goes straight to a boss.

Current open tasks:
${lines.join('\n')}
${completedSection}

Status Update:`

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
