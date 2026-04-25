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
  const [activeTab, setActiveTab] = useState<string>(tabs?.[0]?.id ?? 'data');

  return (
    <div className={cn('flex h-full flex-col', className)}>
      <header className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
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
          onValueChange={setActiveTab}
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
    return (
      <textarea
        defaultValue={text}
        onBlur={(e) => onChange?.(e.target.value)}
        spellCheck={false}
        className="h-full w-full resize-none border-0 bg-muted/40 p-3 font-mono text-xs leading-relaxed focus:outline-none"
      />
    );
  }

  return (
    <ScrollArea className="h-full">
      <pre className="whitespace-pre p-3 font-mono text-xs leading-relaxed text-foreground">
        {text}
      </pre>
    </ScrollArea>
  );
}
