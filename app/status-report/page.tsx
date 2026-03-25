import StatusReportClient from './StatusReportClient'

// Don't block on Monday.com data — client fetches via /api/status-report on load
export default function StatusReportPage() {
  return <StatusReportClient initialData={{ tasksByBoard: {}, completedToday: [] }} />
}
