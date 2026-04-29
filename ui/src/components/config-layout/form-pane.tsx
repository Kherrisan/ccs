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
    <div className={cn('flex h-full flex-col bg-card', className)}>
      {header && (
        // Sticky entity header. 1px accent strip on the top edge nods to the
        // page's primary action (Save) which lives at the bottom — same accent.
        // The bottom edge has a soft inset shadow so when the body scrolls
        // under, the header reads as "elevated" rather than flat.
        <div className="relative flex shrink-0 items-center gap-2 border-b bg-gradient-to-b from-card to-card/70 px-5 py-3 shadow-[0_1px_0_oklch(0_0_0/0.04),0_4px_8px_-4px_oklch(0_0_0/0.06)]">
          <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-accent/40" />
          {header}
        </div>
      )}
      <ScrollArea className="flex-1">
        {/* Body uses a faint muted wash so FormSections (bg-card) read as
            elevated cards. Without this they would float on a same-color shell. */}
        <div className="space-y-4 bg-muted/20 p-5">{children}</div>
      </ScrollArea>
      {footer && (
        // Footer anchors the primary save action; muted/40 shadow pulls focus
        // downward and keeps the action button visible while the body scrolls.
        <div className="flex shrink-0 items-center gap-2 border-t bg-muted/40 px-5 py-3 backdrop-blur">
          {footer}
        </div>
      )}
    </div>
  );
}
