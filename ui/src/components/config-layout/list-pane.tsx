import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export interface ListPaneItem {
  id: string;
  label: ReactNode;
  badge?: ReactNode;
  icon?: ReactNode;
}

interface ListPaneProps {
  items: ListPaneItem[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/**
 * ListPane - Sidebar list of selectable entities (multi-entity Config pages).
 *
 * Provides search input + scrollable list + footer slot for "+ Add" actions.
 */
export function ListPane({
  items,
  selectedId,
  onSelect,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search…',
  header,
  footer,
  className,
}: ListPaneProps) {
  return (
    <div className={cn('flex h-full flex-col', className)}>
      {header && <div className="border-b p-3">{header}</div>}
      {onSearchChange && (
        <div className="relative border-b p-2">
          <Search className="absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchValue ?? ''}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-8 pl-7 text-sm"
          />
        </div>
      )}
      <ScrollArea className="flex-1">
        <ul className="p-2">
          {items.map((item) => {
            const selected = item.id === selectedId;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={cn(
                    'group/item relative flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-all duration-150',
                    // Crail accent leading-edge stripe on the selected row —
                    // matches the FormSection treatment so the "active entity"
                    // visually links to its form on the right.
                    'before:absolute before:inset-y-1 before:left-0 before:w-[3px] before:rounded-r before:bg-transparent before:transition-colors',
                    selected
                      ? 'bg-accent/10 text-foreground before:bg-accent'
                      : 'hover:bg-muted/60 hover:before:bg-accent/30'
                  )}
                  aria-current={selected ? 'true' : undefined}
                >
                  {item.icon && (
                    <span
                      className={cn(
                        'shrink-0 transition-colors',
                        selected
                          ? 'text-accent'
                          : 'text-muted-foreground group-hover/item:text-foreground'
                      )}
                    >
                      {item.icon}
                    </span>
                  )}
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate transition-colors',
                      selected && 'font-medium'
                    )}
                  >
                    {item.label}
                  </span>
                  {item.badge && (
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums transition-colors',
                        selected ? 'bg-accent/15 text-accent' : 'bg-muted/60 text-muted-foreground'
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </ScrollArea>
      {footer && <div className="border-t p-2">{footer}</div>}
    </div>
  );
}
