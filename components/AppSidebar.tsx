'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Clapperboard, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TeamMember {
  id: number
  name: string
}

const navLinks = [
  { href: '/', label: 'Weekly Report', icon: LayoutDashboard },
  { href: '/studio', label: 'Studio', icon: Clapperboard },
]

export function AppSidebar() {
  const pathname = usePathname()
  const [members, setMembers] = useState<TeamMember[]>([])

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => setMembers(d.members ?? []))
      .catch(() => {})
  }, [])

  return (
    <aside className="w-56 fixed top-0 left-0 h-screen flex flex-col border-r bg-white z-40">
      <div className="px-4 py-5 border-b">
        <span className="font-semibold text-lg">Weekly Report</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <nav className="px-3 py-4 flex flex-col gap-1">
          {navLinks.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                pathname === href
                  ? 'bg-muted font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          ))}
        </nav>

        {members.length > 0 && (
          <div className="px-3 pb-4">
            <p className="text-xs font-medium text-muted-foreground px-3 mb-2 uppercase tracking-wide">
              Team
            </p>
            <div className="flex flex-col gap-1">
              {members.map(m => {
                const initials = m.name
                  .split(' ')
                  .map((n: string) => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2)
                return (
                  <Link
                    key={m.id}
                    href={`/?member=${m.id}`}
                    className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  >
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-medium shrink-0">
                      {initials}
                    </span>
                    <span className="truncate">{m.name}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="px-3 py-4 border-t">
        <Link
          href="/settings"
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
            pathname === '/settings'
              ? 'bg-muted font-medium text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          )}
        >
          <Settings className="h-4 w-4 shrink-0" />
          Settings
        </Link>
      </div>
    </aside>
  )
}
