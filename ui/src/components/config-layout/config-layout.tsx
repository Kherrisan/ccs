import { useEffect, useState, type ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const DESKTOP_BREAKPOINT_PX = 1024;

/**
 * Track whether the viewport meets the desktop breakpoint.
 * Used to render EITHER the 3-pane grid OR the mobile tabs — never both.
 * Rendering both at once duplicates FormSection ids in the DOM, which breaks
 * SectionRail scroll-spy (getElementById returns the hidden desktop copy first).
 */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === 'undefined'
      ? true // SSR-safe default; harmless on first paint
      : window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT_PX}px)`).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT_PX}px)`);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isDesktop;
}

interface ConfigLayoutProps {
  /** Left rail: <ListPane> for multi-entity, <SectionRail> for single-entity, omit for none. */
  left?: ReactNode;
  /** Middle pane: form. */
  form: ReactNode;
  /** Right pane: raw JSON / effective config. Omit to hide. */
  json?: ReactNode;
  className?: string;
}

/**
 * ConfigLayout - Strict 3-pane shell for every Config archetype page.
 *
 * - >=1024px: 3-column grid (left 260px / form flex / json 360px)
 * - <1024px: tabs (left | form | json)
 *
 * Single component, prop-controlled left rail. The contract:
 * - <ConfigLayout left={<ListPane …/>}  …/>  // multi-entity
 * - <ConfigLayout left={<SectionRail …/>} …/> // single-entity
 * - <ConfigLayout …/>                          // no rail
 */
export function ConfigLayout({ left, form, json, className }: ConfigLayoutProps) {
  const isDesktop = useIsDesktop();

  // CRITICAL: render exactly one layout at a time. Rendering both and
  // toggling visibility via Tailwind `hidden lg:grid` would mount two copies
  // of every FormSection — SectionRail's scroll-spy and click-to-jump use
  // document.getElementById() which would resolve to the (hidden) desktop
  // copy first on mobile, breaking the rail entirely.
  if (isDesktop) {
    return (
      <div
        className={cn(
          'grid min-h-0 flex-1 gap-4 p-4',
          left && json && 'grid-cols-[260px_minmax(0,1fr)_360px]',
          left && !json && 'grid-cols-[260px_minmax(0,1fr)]',
          !left && json && 'grid-cols-[minmax(0,1fr)_360px]',
          !left && !json && 'grid-cols-1',
          className
        )}
      >
        {left && (
          <aside className="min-w-0 overflow-hidden rounded-xl border bg-card">{left}</aside>
        )}
        <main className="min-w-0 overflow-hidden rounded-xl border bg-card">{form}</main>
        {json && (
          <aside className="min-w-0 overflow-hidden rounded-xl border bg-card">{json}</aside>
        )}
      </div>
    );
  }

  return <MobileTabs left={left} form={form} json={json} className={className} />;
}

function MobileTabs({
  left,
  form,
  json,
  className,
}: Pick<ConfigLayoutProps, 'left' | 'form' | 'json' | 'className'>) {
  const tabs = [
    left && { id: 'list', label: 'Browse', node: left },
    { id: 'form', label: 'Configure', node: form },
    json && { id: 'json', label: 'JSON', node: json },
  ].filter(Boolean) as { id: string; label: string; node: ReactNode }[];
  const [selected, setSelected] = useState(tabs[0]?.id ?? 'form');

  // Derive the effective active tab during render so a parent toggling `left`
  // or `json` (which changes the available tabs) cannot leave us pointing at
  // an id that no longer exists. Falls back to the first available tab.
  const active = tabs.some((t) => t.id === selected) ? selected : (tabs[0]?.id ?? 'form');

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-3 p-3', className)}>
      <Tabs value={active} onValueChange={setSelected}>
        <TabsList className="w-full">
          {tabs.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="flex-1">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((t) => (
          <TabsContent key={t.id} value={t.id} className="rounded-xl border bg-card">
            {t.node}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
