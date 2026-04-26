import { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export function Field({
  label,
  defaultValue,
  sensitive,
}: {
  label: string;
  defaultValue?: string;
  sensitive?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  // Heuristic: any *AUTH_TOKEN* / *_KEY / *_SECRET label is sensitive by default.
  const isSensitive = sensitive ?? /AUTH_TOKEN|API_KEY|SECRET|PASSWORD|PRIVATE_KEY/i.test(label);

  return (
    <div className="group/field space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {isSensitive && <Lock className="size-3 text-accent/70" />}
          {label}
        </Label>
        {isSensitive && (
          <span className="rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-accent">
            sensitive
          </span>
        )}
      </div>
      <div className="relative">
        <Input
          type={isSensitive && !revealed ? 'password' : 'text'}
          defaultValue={defaultValue}
          className={cn(
            'font-mono text-sm transition-all',
            'focus-visible:ring-1 focus-visible:ring-accent/40 focus-visible:border-accent/50',
            isSensitive && 'pr-9'
          )}
        />
        {isSensitive && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-accent"
            aria-label={revealed ? 'Hide value' : 'Reveal value'}
          >
            {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        )}
      </div>
    </div>
  );
}
