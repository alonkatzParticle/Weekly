'use client'
import { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface TimeTrackingProps {
  mondayUserId: string
  weekStart: string
  weekEnd: string
}

export function TimeTracking({ mondayUserId, weekStart, weekEnd }: TimeTrackingProps) {
  const [data, setData] = useState<{
    currentWeek: number
    history: { weekEnding: string; hours: number }[]
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(
        `/api/monday/time-tracking?user_id=${mondayUserId}&week_start=${weekStart}&week_end=${weekEnd}`
      )
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [mondayUserId, weekStart, weekEnd])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading)
    return (
      <div className="animate-pulse text-sm text-muted-foreground p-4">
        Loading time tracking...
      </div>
    )
  if (error) return <div className="text-red-500 text-sm p-4">{error}</div>
  if (!data) return null

  const chartData = data.history.map(h => ({
    week: h.weekEnding.slice(5),
    hours: h.hours,
  }))

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Time Tracking
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <span className="text-3xl font-bold">{data.currentWeek}h</span>
          <span className="text-muted-foreground ml-2 text-sm">this week</span>
        </div>
        {chartData.length > 0 && (
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [`${v}h`, 'Hours']} />
                <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
