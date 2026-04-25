import { useState, type ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

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
  return (
    <>
      {/* Desktop: 3-pane grid */}
      <div
        className={cn(
          'hidden min-h-0 flex-1 lg:grid lg:gap-4 lg:p-4',
          left && json && 'lg:grid-cols-[260px_minmax(0,1fr)_360px]',
          left && !json && 'lg:grid-cols-[260px_minmax(0,1fr)]',
          !left && json && 'lg:grid-cols-[minmax(0,1fr)_360px]',
          !left && !json && 'lg:grid-cols-1',
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

      {/* Mobile/tablet: tabs */}
      <MobileTabs left={left} form={form} json={json} className={className} />
    </>
  );
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
    <div className={cn('flex min-h-0 flex-1 flex-col gap-3 p-3 lg:hidden', className)}>
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
