import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AppSidebar } from '@/components/AppSidebar'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Weekly Report',
  description: 'Creative studio weekly report generator',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AppSidebar />
        <main className="ml-56 min-h-screen px-8 py-8">{children}</main>
      </body>
    </html>
  )
}
