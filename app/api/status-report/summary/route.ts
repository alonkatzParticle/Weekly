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

    // Flatten all tasks across boards, sorted critical first then high
    const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2 }
    const allTasks: any[] = []
    for (const [board, tasks] of Object.entries(tasksByBoard as Record<string, any[]>)) {
      for (const t of tasks) allTasks.push({ ...t, board_name: board })
    }
    allTasks.sort((a, b) =>
      (PRIORITY_ORDER[a.priority?.toLowerCase()] ?? 3) - (PRIORITY_ORDER[b.priority?.toLowerCase()] ?? 3)
    )

    const lines: string[] = allTasks.map(t => {
      const assignees = (t.assignee_names as string[])?.join(', ') || 'Unassigned'
      return `- ${t.name} | ${t.priority} | ${t.status || 'No status'} | ${t.board_name} | Assigned: ${assignees}`
    })

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
- ## Critical Items — only if any critical priority tasks exist. Group tasks by assignee using ### Assignee Name subsections. For each task include its status in brackets: "Task Name [Status]"
- ## In Progress — open high-priority work structured as:
  ### Board/Team Name
  #### Person Name
  - **Task Name** - one short sentence description [Status]
  Group by board first (### heading), then by person within that board (#### heading). Every task must show status in brackets.
- ## Next Steps — 2-3 action items max

Keep it scannable and direct. This goes straight to a boss.

Current open tasks (format: name | priority | status | board | assigned):
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
