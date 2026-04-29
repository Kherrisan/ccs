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
      className={cn(
        'group/section relative scroll-mt-4 overflow-hidden rounded-lg border bg-card/60 p-4 pl-5',
        // Crail accent stripe on the leading edge. Three-state intensity:
        //   - default: 30% (visible but quiet)
        //   - hover:   70% (scan affordance)
        //   - focus-within: 100% solid + soft Crail ring on the section itself,
        //     so the user always knows which group "owns" their cursor.
        'before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:bg-accent/30 before:transition-all',
        'transition-all duration-200 hover:bg-card/80 hover:before:bg-accent/70',
        'focus-within:bg-card focus-within:shadow-sm focus-within:before:w-[3px] focus-within:before:bg-accent',
        'focus-within:ring-1 focus-within:ring-accent/20',
        className
      )}
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full bg-accent transition-transform group-hover/section:scale-125"
            />
            {title}
          </h3>
          {description && (
            <p className="mt-0.5 pl-3.5 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
