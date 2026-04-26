import { useEffect, useState, type ReactNode } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { GripVertical } from 'lucide-react';
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
  /**
   * Persistence key for the form↔json split ratio (per §0e). Optional —
   * defaults to a key derived from `window.location.pathname` so each
   * route gets its own localStorage slot automatically. Pass an explicit
   * key only when sub-routes should share split state, or to opt out of
   * pathname coupling. Avoid hardcoded shared keys: they cause split
   * ratios to bleed across unrelated Config pages.
   */
  storageKey?: string;
  className?: string;
}

/**
 * ConfigLayout - Strict 3-pane shell for every Config archetype page.
 *
 * - >=1024px: content-fit rail (§0a, w-fit min 240 / max 360) + resizable
 *   form/json split (§0e); rail itself is NOT user-resizable
 * - <1024px: tabs (left | form | json)
 *
 * Single component, prop-controlled left rail. The contract:
 * - <ConfigLayout left={<ListPane …/>}  …/>  // multi-entity
 * - <ConfigLayout left={<SectionRail …/>} …/> // single-entity
 * - <ConfigLayout …/>                          // no rail
 *
 * The form↔json divider is user-draggable (react-resizable-panels). The
 * chosen ratio persists in localStorage via `autoSaveId={storageKey}`. Min
 * sizes prevent either pane from collapsing to unreadable.
 */
export function ConfigLayout({ left, form, json, storageKey, className }: ConfigLayoutProps) {
  const isDesktop = useIsDesktop();
  // Per-route default so pages get unique localStorage slots automatically
  // (prevents the cross-page state bleed that a hardcoded shared default
  // would cause). SSR-safe: falls back to a stable string when window is
  // unavailable. Pages can still pass an explicit storageKey to opt out of
  // pathname coupling (e.g. when sub-routes should share split state).
  const effectiveKey =
    storageKey ??
    (typeof window === 'undefined'
      ? 'config-layout.default'
      : `config-layout${window.location.pathname.replace(/\//g, '.')}`);

  // CRITICAL: render exactly one layout at a time. Rendering both and
  // toggling visibility via Tailwind `hidden lg:grid` would mount two copies
  // of every FormSection — SectionRail's scroll-spy and click-to-jump use
  // document.getElementById() which would resolve to the (hidden) desktop
  // copy first on mobile, breaking the rail entirely.
  if (isDesktop) {
    return (
      <div className={cn('flex min-h-0 flex-1 gap-4 p-4', className)}>
        {left && (
          // §0a: rail width is content-fit within a unified envelope.
          // Floor (min-w 240px) prevents the header from squeezing controls
          // into a wrap. Cap (max-w 360px) prevents the rail from dominating
          // the body when entity labels are unusually long; per-item
          // truncation inside ListPane handles overflow beyond that.
          // `w-fit` lets the rail expand to the largest atomic header element
          // (title + buttons) so titles never break across two lines.
          <aside className="w-fit min-w-[240px] max-w-[360px] shrink-0 overflow-hidden rounded-xl border bg-card">
            {left}
          </aside>
        )}
        <PanelGroup direction="horizontal" autoSaveId={effectiveKey} className="min-w-0 flex-1">
          <Panel defaultSize={json ? 45 : 100} minSize={json ? 30 : 100} order={1}>
            <main className="h-full overflow-hidden rounded-xl border bg-card">{form}</main>
          </Panel>
          {json && <ResizeDivider />}
          {json && (
            <Panel defaultSize={55} minSize={30} order={2}>
              <aside className="h-full overflow-hidden rounded-xl border bg-card">{json}</aside>
            </Panel>
          )}
        </PanelGroup>
      </div>
    );
  }

  return <MobileTabs left={left} form={form} json={json} className={className} />;
}

/**
 * ResizeDivider - draggable handle between form and json panes (§0e).
 *
 * Keyboard accessible (arrow keys move 16px increments per
 * react-resizable-panels default). Visual: thin 8px hot zone with a 1px
 * vertical line and a centered grip glyph that brightens on hover/drag.
 */
function ResizeDivider() {
  return (
    <PanelResizeHandle
      className={cn(
        'group relative mx-1 flex w-2 shrink-0 items-center justify-center',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring rounded'
      )}
      aria-label="Resize form and JSON panes"
    >
      {/* Thin vertical line */}
      <div
        className={cn(
          'h-full w-px bg-border transition-colors',
          'group-hover:bg-accent group-data-[resize-handle-state=drag]:bg-accent'
        )}
      />
      {/* Grip glyph appears on hover/drag */}
      <div
        className={cn(
          'absolute flex h-8 w-3 items-center justify-center rounded border bg-background opacity-0 shadow-sm transition-opacity',
          'group-hover:opacity-100 group-data-[resize-handle-state=drag]:opacity-100'
        )}
      >
        <GripVertical className="size-3 text-muted-foreground" />
      </div>
    </PanelResizeHandle>
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
