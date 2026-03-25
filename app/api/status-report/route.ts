import { NextRequest, NextResponse } from 'next/server'
import { getStatusReportData } from '@/lib/statusReport'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const force = new URL(req.url).searchParams.get('force') === 'true'
    const data = await getStatusReportData(force)
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
