import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageShellProps {
  children: ReactNode;
  className?: string;
}

/**
 * PageShell - Outer wrapper for every dashboard page.
 *
 * Provides:
 * - Consistent max-width and padding
 * - Vertical flex layout for header + body
 *
 * Compose with PageHeader + (ConfigLayout | MonitorLayout) inside.
 */
export function PageShell({ children, className }: PageShellProps) {
  return <div className={cn('flex h-full min-h-0 w-full flex-col', className)}>{children}</div>;
}
