'use client'
import { useState } from 'react'
import { format, addWeeks, subWeeks } from 'date-fns'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getWeekRange } from '@/lib/utils'

interface WeekSelectorProps {
  selectedDate: Date
  onWeekChange: (date: Date) => void
}

export function WeekSelector({ selectedDate, onWeekChange }: WeekSelectorProps) {
  const { start, end } = getWeekRange(selectedDate)

  const isCurrentWeek = () => {
    const now = new Date()
    const { start: nowStart } = getWeekRange(now)
    return start.getTime() === nowStart.getTime()
  }

  return (
    <div className="flex items-center gap-4 bg-white border rounded-lg px-4 py-3 shadow-sm">
      <Calendar className="h-5 w-5 text-muted-foreground" />
      <span className="text-sm font-medium text-muted-foreground">Week:</span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onWeekChange(subWeeks(selectedDate, 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold min-w-[200px] text-center">
          {format(start, 'MMM d')} &ndash; {format(end, 'MMM d, yyyy')}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onWeekChange(addWeeks(selectedDate, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      {!isCurrentWeek() && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onWeekChange(new Date())}
          className="text-xs"
        >
          This Week
        </Button>
      )}
    </div>
  )
}
