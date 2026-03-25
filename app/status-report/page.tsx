import { getStatusReportData } from '@/lib/statusReport'
import StatusReportClient from './StatusReportClient'

export default async function StatusReportPage() {
  const initialData = await getStatusReportData().catch(() => ({ tasksByBoard: {}, completedToday: [] }))
  return <StatusReportClient initialData={initialData} />
}
