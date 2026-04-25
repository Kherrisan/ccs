import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface FormSectionProps {
  /** Anchor id — must match SectionRail item id for scroll-spy. */
  id: string;
  title: ReactNode;
  description?: ReactNode;
  /** Optional trailing actions in section header. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * FormSection - Titled card group inside FormPane.
 *
 * The `id` prop is REQUIRED and drives SectionRail scroll-spy. Each section in a
 * single-entity Config page should have a stable, kebab-case id like "general", "auth", "routing".
 */
export function FormSection({
  id,
  title,
  description,
  actions,
  children,
  className,
}: FormSectionProps) {
  return (
    <section
      id={id}
      className={cn('scroll-mt-4 rounded-lg border bg-background/40 p-4', className)}
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
