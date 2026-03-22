import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Week starts on Sunday (Israeli week: Sun–Sat)
export function getWeekRange(date: Date): { start: Date; end: Date } {
  const d = new Date(date)
  const day = d.getDay() // 0=Sun, 6=Sat
  const sunday = new Date(d)
  sunday.setDate(d.getDate() - day)
  sunday.setHours(0, 0, 0, 0)
  const saturday = new Date(sunday)
  saturday.setDate(sunday.getDate() + 6)
  saturday.setHours(23, 59, 59, 999)
  return { start: sunday, end: saturday }
}

export function getPreviousWeek(date: Date): { start: Date; end: Date } {
  const { start } = getWeekRange(date)
  const prevSunday = new Date(start)
  prevSunday.setDate(start.getDate() - 7)
  return getWeekRange(prevSunday)
}

export function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getWeekKey(date: Date): string {
  const { end } = getWeekRange(date)
  return formatDate(end)
}
