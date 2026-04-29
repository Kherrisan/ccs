import { useEffect, useState, type ReactNode } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export interface SectionRailItem {
  id: string;
  label: ReactNode;
  badge?: ReactNode;
}

interface SectionRailProps {
  sections: SectionRailItem[];
  /** ID of the FormSection element to scroll into view on click. Section's `id` prop must match. */
  onJump?: (id: string) => void;
  /** Optional: container element to observe for scroll-spy. Defaults to scrollable ancestor. */
  observeRoot?: HTMLElement | null;
  header?: ReactNode;
  className?: string;
}

/**
 * SectionRail - Anchor nav for single-entity Config pages.
 *
 * Replaces ListPane on pages that configure ONE entity (codex, copilot, cursor, droid…).
 * Each item maps to a <FormSection id="…"> in the FormPane. Scroll-spy via
 * IntersectionObserver auto-highlights the active section.
 *
 * Click → smooth-scrolls the matching FormSection into view.
 */
export function SectionRail({
  sections,
  onJump,
  observeRoot,
  header,
  className,
}: SectionRailProps) {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? '');

  // Scroll-spy: observe each FormSection element by id
  useEffect(() => {
    const els = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;

    // FormPane wraps its body in shadcn ScrollArea (radix), which means the
    // actual scrolling element is an ancestor with overflow-y:auto/scroll —
    // NOT the page viewport. Walk up from the first FormSection to find it.
    // Without this, IntersectionObserver watches the wrong scroller and the
    // active section never updates as the form scrolls.
    const root = observeRoot ?? findScrollableAncestor(els[0]);

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the section closest to top that's intersecting
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      {
        root,
        rootMargin: '-20% 0px -60% 0px',
        threshold: 0,
      }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections, observeRoot]);

  const handleJump = (id: string) => {
    setActiveId(id);
    if (onJump) {
      onJump(id);
      return;
    }
    // scrollIntoView walks ancestors — works whether the scroller is the
    // viewport or the FormPane's internal ScrollArea.
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {header && <div className="border-b p-3">{header}</div>}
      <ScrollArea className="flex-1">
        <ul className="p-2">
          {sections.map((s) => {
            const active = s.id === activeId;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => handleJump(s.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                    active
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  )}
                >
                  <span
                    className={cn(
                      'inline-block size-1.5 shrink-0 rounded-full transition-colors',
                      active ? 'bg-accent-foreground' : 'bg-muted-foreground/30'
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{s.label}</span>
                  {s.badge && (
                    <span className="shrink-0 text-xs text-muted-foreground">{s.badge}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </ScrollArea>
    </div>
  );
}

/**
 * Walk up the DOM until we find an element whose computed style scrolls vertically.
 * Returns null if none found (IntersectionObserver treats null as the viewport).
 */
function findScrollableAncestor(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el?.parentElement ?? null;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    const overflowY = style.overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}
