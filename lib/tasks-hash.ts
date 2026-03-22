import { createHash } from 'crypto'
import type { MondayTask } from './monday'

/**
 * Produces a short fingerprint of a task list.
 * Only includes fields that affect summary content — ignoring dropbox_link, board_name etc.
 * Tasks are sorted by id so order doesn't matter.
 */
export function hashTasks(tasks: MondayTask[]): string {
  const key = tasks
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(t => `${t.id}|${t.name}|${t.status}|${t.priority}|${t.timeline_start ?? ''}|${t.timeline_end ?? ''}`)
    .join('\n')
  return createHash('sha256').update(key).digest('hex').slice(0, 16)
}

/**
 * Returns the current and previous week date ranges, computed server-side.
 * Week starts on Sunday (matching the Monday.com epoch used throughout the app).
 */
export function getWeekDates() {
  const today = new Date()
  const day = today.getDay() // 0 = Sunday

  const thisWeekStart = new Date(today)
  thisWeekStart.setDate(today.getDate() - day)
  thisWeekStart.setHours(0, 0, 0, 0)

  const thisWeekEnd = new Date(thisWeekStart)
  thisWeekEnd.setDate(thisWeekStart.getDate() + 6)

  const lastWeekStart = new Date(thisWeekStart)
  lastWeekStart.setDate(thisWeekStart.getDate() - 7)

  const lastWeekEnd = new Date(thisWeekStart)
  lastWeekEnd.setDate(thisWeekStart.getDate() - 1)

  return {
    weekStart: fmt(lastWeekStart),
    weekEnd: fmt(lastWeekEnd),
    nextWeekStart: fmt(thisWeekStart),
    nextWeekEnd: fmt(thisWeekEnd),
    weekEnding: fmt(lastWeekEnd), // Saturday of last week — used as DB cache key
  }
}

function fmt(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
