import type { ReactNode } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface FormPaneProps {
  /** Sticky header above the scrolling form body. Typically entity name + secondary actions. */
  header?: ReactNode;
  /** Form body — typically a stack of <FormSection>s. */
  children: ReactNode;
  /** Footer pinned at bottom. Place primary save action here. */
  footer?: ReactNode;
  className?: string;
}

/**
 * FormPane - Middle pane of ConfigLayout. Holds the form.
 *
 * Layout: optional sticky header, scrolling body, optional sticky footer (for primary actions).
 */
export function FormPane({ header, children, footer, className }: FormPaneProps) {
  return (
    <div className={cn('flex h-full flex-col', className)}>
      {header && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-card px-5 py-3">{header}</div>
      )}
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-5">{children}</div>
      </ScrollArea>
      {footer && (
        <div className="flex shrink-0 items-center gap-2 border-t bg-card/80 px-5 py-3 backdrop-blur">
          {footer}
        </div>
      )}
    </div>
  );
}
