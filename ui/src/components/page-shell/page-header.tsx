import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * PageHeader - Standard header strip for every page.
 *
 * Slots:
 * - title: page name (required)
 * - description: short subtitle below title
 * - status: status badge / chip on the trailing side
 * - actions: button group on the trailing side
 *
 * Layout: title block on left, status + actions on right.
 */
export function PageHeader({ title, description, status, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col gap-3 border-b bg-background/50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {status && <div className="flex items-center gap-2">{status}</div>}
        </div>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
