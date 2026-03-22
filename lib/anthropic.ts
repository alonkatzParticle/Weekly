import Anthropic from '@anthropic-ai/sdk'
import type { MondayTask } from './monday'

export function createAnthropicClient(apiKey: string) {
  return new Anthropic({ apiKey })
}

export function buildLastWeekPrompt(memberName: string, tasks: MondayTask[]): string {
  const taskList = tasks.map(t =>
    `- ${t.name} (Project: ${t.board_name}, Priority: ${t.priority}, Status: ${t.status}${t.timeline_end ? `, Due: ${t.timeline_end}` : ''})`
  ).join('\n')

  return `You are a creative studio manager writing a weekly report for your boss.

Write a concise, professional 2-3 paragraph summary of what ${memberName} accomplished last week based on their completed tasks. Highlight high-priority items prominently. Be specific about the work done. Write in third person.

Completed tasks:
${taskList}

Summary:`
}

export function buildThisWeekPrompt(memberName: string, tasks: MondayTask[]): string {
  const taskList = tasks.map(t =>
    `- ${t.name} (Project: ${t.board_name}, Priority: ${t.priority}${t.timeline_start ? `, Starts: ${t.timeline_start}` : ''}${t.timeline_end ? `, Due: ${t.timeline_end}` : ''})`
  ).join('\n')

  return `You are a creative studio manager writing a weekly report for your boss.

Write a concise 1-2 paragraph preview of what ${memberName} is focused on this week based on their upcoming tasks. Mention any high-priority or time-sensitive items. Write in third person.

Upcoming tasks:
${taskList}

Preview:`
}

export function buildTeamSummaryPrompt(tasks: Array<{ memberName: string; isVideoTeam: boolean; task: MondayTask }>): string {
  const taskList = tasks.map(t =>
    `- [${t.isVideoTeam ? 'VIDEO' : 'DESIGN'}] ${t.memberName}: ${t.task.name} (Project: ${t.task.board_name}, Priority: ${t.task.priority}, Status: ${t.task.status})`
  ).join('\n')

  return `You are a creative studio manager writing a brief weekly recap for your boss.

Split the summary into two sections: "## Video Team" and "## Design Team".
Skip a section entirely if there are no tasks for it.
Do NOT add a title or intro line at the top — start directly with the first section.

Rules:
- Max 2 bullets per person. Pick only their most important or unique work.
- Keep bullets very short — no complete sentences needed. Conversational tone.
- Add a sub-bullet ONLY when someone did two things that are related but distinct (not just more detail on the same task).
- **Bold** person names and key task/campaign names.
- Do not list every task — synthesize and prioritize.
- META platform tasks with Medium or Low priority should NOT be listed individually. Instead, count them up per person and add a single bullet like "**Name** knocked out X META ads this week".

Team's completed tasks:
${taskList}

Team Summary:`
}

export function buildStudioPrompt(memberName: string, tasks: MondayTask[], type: 'studio_last' | 'studio_next'): string {
  const high = tasks.filter(t => /high|critical/i.test(t.priority))
  const other = tasks.filter(t => !/high|critical/i.test(t.priority))

  const highList = high.length > 0 ? high.map(t => `- ${t.name} (${t.board_name})`).join('\n') : 'None'
  const otherList = other.length > 0 ? other.map(t => `- ${t.name} (${t.board_name})`).join('\n') : 'None'

  if (type === 'studio_last') {
    return `You are writing a brief studio overview entry for ${memberName}'s work last week.

HIGH/CRITICAL priority tasks completed:
${highList}

MEDIUM/LOW priority tasks completed:
${otherList}

Write 4-6 bullet points. Use short, punchy fragments — not full sentences. Think quick scan notes, not prose. Name high/critical tasks specifically. Group medium/low into brief summary bullets. Third person. No filler words. Start each bullet with "•".

Summary:`
  } else {
    return `You are writing a brief studio overview entry for ${memberName}'s upcoming work this week.

HIGH/CRITICAL priority tasks coming up:
${highList}

MEDIUM/LOW priority tasks coming up:
${otherList}

Write 4-6 bullet points. Use short, punchy fragments — not full sentences. Think quick scan notes, not prose. Name high/critical upcoming tasks specifically. Group medium/low into brief summary bullets. Third person. No filler words. Start each bullet with "•".

Preview:`
  }
}

export async function generateSummaryStream(prompt: string, apiKey: string): Promise<ReadableStream> {
  const client = createAnthropicClient(apiKey)

  const stream = await client.messages.stream({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  return new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          controller.enqueue(new TextEncoder().encode(chunk.delta.text))
        }
      }
      controller.close()
    }
  })
}

export async function generateSummary(prompt: string, apiKey: string): Promise<string> {
  const client = createAnthropicClient(apiKey)

  const message = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  return message.content[0].type === 'text' ? message.content[0].text : ''
}
