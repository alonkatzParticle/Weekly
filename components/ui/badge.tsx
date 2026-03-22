import { cn } from '@/lib/utils'

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'destructive' | 'warning'
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
        {
          'border-transparent bg-primary text-primary-foreground': variant === 'default',
          'border-transparent bg-secondary text-secondary-foreground': variant === 'secondary',
          'text-foreground': variant === 'outline',
          'border-transparent bg-red-500 text-white': variant === 'destructive',
          'border-transparent bg-yellow-500 text-white': variant === 'warning',
        },
        className
      )}
      {...props}
    />
  )
}

export { Badge }
