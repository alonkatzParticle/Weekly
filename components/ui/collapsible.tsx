'use client'
import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CollapsibleProps {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
  className?: string
}

export function Collapsible({ title, children, defaultOpen = false, className }: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={cn('border rounded-md', className)}>
      <button
        className="flex w-full items-center justify-between p-4 text-sm font-medium hover:bg-muted/50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        {title}
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}
