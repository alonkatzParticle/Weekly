'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MarkdownText } from '@/components/MarkdownText'
import type { MondayTask } from '@/lib/monday'

interface TeamSummaryProps {
  weekEnd: string
  tasks: Array<{ memberName: string; isVideoTeam: boolean; task: MondayTask }>
  tasksLoaded: boolean
}

export function TeamSummary({ weekEnd, tasks, tasksLoaded }: TeamSummaryProps) {
  const [summary, setSummary] = useState('')
  const [summaryLoading, setSummaryLoading] = useState(false)
  const autoFetchedRef = useRef<string | null>(null)

  const fetchSummary = useCallback(
    async (regenerate = false) => {
      setSummaryLoading(true)
      setSummary('')
      try {
        const res = await fetch('/api/ai/team-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tasks,
            weekEnding: weekEnd,
            regenerate,
          }),
        })
        if (!res.ok) throw new Error('Failed to generate summary')
        const reader = res.body?.getReader()
        if (!reader) return
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          setSummary(prev => prev + new TextDecoder().decode(value))
        }
      } catch (err) {
        setSummary(`Error generating team summary: ${err}`)
      } finally {
        setSummaryLoading(false)
      }
    },
    [tasks, weekEnd]
  )

  useEffect(() => {
    if (tasksLoaded && autoFetchedRef.current !== weekEnd) {
      autoFetchedRef.current = weekEnd
      fetchSummary()
    }
  }, [tasksLoaded, weekEnd, fetchSummary])

  if (!tasksLoaded) {
    return (
      <Card className="mb-8 border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 text-muted-foreground animate-pulse">
            <Users className="h-5 w-5" />
            <span className="text-sm">Generating team overview...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!summaryLoading && !summary && tasks.length === 0) {
    return null
  }

  return (
    <Card className="mb-8 border-primary/20 bg-muted/30">
      <CardHeader className="pb-3 border-b bg-muted/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Team Highlights: Last Week</CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchSummary(true)}
            disabled={summaryLoading}
            className="h-8 gap-2 text-xs bg-background"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${summaryLoading ? 'animate-spin' : ''}`} />
            Regenerate
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {summaryLoading && !summary ? (
          <div className="space-y-3">
            <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
            <div className="h-4 bg-muted animate-pulse rounded w-full" />
            <div className="h-4 bg-muted animate-pulse rounded w-5/6" />
          </div>
        ) : (
          summary
            ? <MarkdownText text={summary} />
            : <p className="text-sm text-muted-foreground">No highlights available.</p>
        )}
      </CardContent>
    </Card>
  )
}
