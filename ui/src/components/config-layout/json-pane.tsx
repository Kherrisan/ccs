import { useMemo, useState, type ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CopyButton } from '@/components/ui/copy-button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export interface JsonTab {
  id: string;
  label: ReactNode;
  /** Object/array to render. Stringified internally. */
  data: unknown;
}

interface JsonPaneProps {
  /** Single source — used when there's only one view. */
  data?: unknown;
  /** Multi-tab mode (e.g. Effective | Override | Diff). */
  tabs?: JsonTab[];
  title?: ReactNode;
  /** Accept structural edits. Off by default — Phase 1 ships read-only baseline. */
  editable?: boolean;
  /** Called when editable=true and user commits a change. */
  onChange?: (next: string) => void;
  className?: string;
}

/**
 * JsonPane - Right pane of ConfigLayout. Displays raw / effective configuration.
 *
 * Read-only by default. Pass `editable` to opt-in to inline editing (cliproxy uses this).
 * Single-source via `data` OR multi-tab via `tabs` (e.g. effective / override / diff).
 */
export function JsonPane({
  data,
  tabs,
  title = 'Configuration',
  editable = false,
  onChange,
  className,
}: JsonPaneProps) {
  const hasTabs = tabs && tabs.length > 0;
  const [selectedTabId, setSelectedTabId] = useState<string>(tabs?.[0]?.id ?? 'data');

  // Derive the *effective* active tab during render rather than mutating state
  // in an effect. If the parent swaps the `tabs` array (e.g. selects a different
  // entity), the previous selectedTabId may no longer exist — fall back to the
  // first available tab so the pane never shows empty content.
  const activeTab =
    hasTabs && tabs.some((t) => t.id === selectedTabId) ? selectedTabId : (tabs?.[0]?.id ?? 'data');

  return (
    // Outer shell: muted wash differentiates the json pane from the form pane
    // (bg-card) so the two sibling panes are visually distinct without a
    // hard divider line. Maintains the Pampas/Crail palette — no new colors.
    <div className={cn('flex h-full flex-col bg-muted/30', className)}>
      <header className="relative flex shrink-0 items-center justify-between gap-2 border-b bg-card/80 px-4 py-2.5 backdrop-blur">
        {/* 1px Crail strip at the top edge — visually links to FormPane's header strip. */}
        <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-accent/40" />
        <div className="flex items-center gap-2">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-accent" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </h3>
          <span
            className={cn(
              'rounded border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider',
              editable
                ? 'border-accent/40 bg-accent/10 text-accent'
                : 'border-border bg-muted/60 text-muted-foreground'
            )}
          >
            {editable ? 'editable' : 'read only'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <CopyButton
            value={
              hasTabs
                ? JSON.stringify(tabs.find((t) => t.id === activeTab)?.data ?? {}, null, 2)
                : JSON.stringify(data ?? {}, null, 2)
            }
          />
        </div>
      </header>

      {hasTabs ? (
        <Tabs
          value={activeTab}
          onValueChange={setSelectedTabId}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList className="mx-3 mt-2 w-fit">
            {tabs.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="text-xs">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((t) => (
            <TabsContent key={t.id} value={t.id} className="min-h-0 flex-1 overflow-hidden">
              <JsonView data={t.data} editable={editable} onChange={onChange} />
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <JsonView data={data} editable={editable} onChange={onChange} />
      )}
    </div>
  );
}

interface JsonViewProps {
  data: unknown;
  editable: boolean;
  onChange?: (next: string) => void;
}

function JsonView({ data, editable, onChange }: JsonViewProps) {
  const text = useMemo(() => JSON.stringify(data ?? {}, null, 2), [data]);

  if (editable) {
    // `key={text}` forces React to remount the textarea when the underlying data
    // changes (e.g. parent swaps the selected entity). Without this, an
    // uncontrolled textarea retains the prior value and onBlur saves stale text.
    return (
      <textarea
        key={text}
        defaultValue={text}
        onBlur={(e) => onChange?.(e.target.value)}
        spellCheck={false}
        className="h-full w-full resize-none border-0 bg-muted/40 p-3 font-mono text-xs leading-relaxed focus:outline-none"
      />
    );
  }

  return (
    <ScrollArea className="h-full">
      {/* Inner card on top of the muted shell — gives the json a subtle
          embossed feel rather than floating on a flat surface. JSON content
          renders plain; a dedicated JSON viewer (with its own color coding)
          will replace this <pre> in a follow-up. */}
      <pre className="m-3 whitespace-pre rounded-md border bg-card/80 p-3 font-mono text-xs leading-relaxed text-foreground shadow-inner">
        {text}
      </pre>
    </ScrollArea>
  );
}
