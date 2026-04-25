import {
  AlertCircle,
  AlertTriangle,
  Copy,
  Terminal,
  Wrench,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { useFixHealth, type HealthCheck } from '@/hooks/use-health';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';

interface HealthPriorityCardProps {
  check: HealthCheck;
}

export function HealthPriorityCard({ check }: HealthPriorityCardProps) {
  const { t } = useTranslation();
  const fixMutation = useFixHealth();
  const hasContent = !!(check.details || check.fix || check.fixable);
  const [isExpanded, setIsExpanded] = useState(false);

  const isError = check.status === 'error';
  const Icon = isError ? AlertCircle : AlertTriangle;

  const copyFix = () => {
    if (check.fix) {
      navigator.clipboard.writeText(check.fix);
      toast.success(t('health.copied'));
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        'group relative overflow-hidden rounded-[2rem] p-px transition-all duration-300',
        isError
          ? 'bg-gradient-to-br from-rose-500/20 via-rose-500/5 to-transparent'
          : 'bg-gradient-to-br from-amber-500/20 via-amber-500/5 to-transparent'
      )}
    >
      <div className="relative h-full rounded-[calc(2rem-1px)] bg-background/80 backdrop-blur-md overflow-hidden">
        {/* Double-Bezel Inner Highlight */}
        <div className="absolute inset-0 rounded-[calc(2rem-1px)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] pointer-events-none" />

        <div className="p-6">
          <div
            className={cn('flex items-start gap-4', hasContent && 'cursor-pointer select-none')}
            onClick={() => hasContent && setIsExpanded(!isExpanded)}
          >
            {/* Status Icon with Ring */}
            <div
              className={cn(
                'flex items-center justify-center w-12 h-12 rounded-2xl shrink-0',
                isError ? 'bg-rose-500/10 text-rose-500' : 'bg-amber-500/10 text-amber-500'
              )}
            >
              <Icon className="w-6 h-6" />
            </div>

            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold tracking-tight">{check.name}</h3>
                {hasContent && (
                  <div className="p-1 hover:bg-muted rounded-full transition-colors">
                    <ChevronRight
                      className={cn(
                        'w-5 h-5 text-muted-foreground transition-transform',
                        isExpanded && 'rotate-90'
                      )}
                    />
                  </div>
                )}
              </div>
              <p className="text-sm font-medium leading-relaxed text-muted-foreground/80">
                {check.message}
              </p>
            </div>
          </div>

          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
                className="overflow-hidden"
              >
                <div className="mt-4 pt-4 border-t border-border/40 space-y-4">
                  {check.details && (
                    <div className="rounded-xl bg-muted/30 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground break-all">
                      {check.details}
                    </div>
                  )}

                  {(check.fix || check.fixable) && (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      {check.fix && (
                        <div className="flex-1 flex items-center gap-2 h-10 px-3 rounded-full bg-background/50 border border-border/40 group/fix">
                          <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
                          <code className="text-xs font-mono flex-1 truncate">{check.fix}</code>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={copyFix}
                            className="h-6 w-6 rounded-full opacity-0 group-hover/fix:opacity-100 transition-opacity"
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      )}

                      {check.fixable && (
                        <Button
                          onClick={() => fixMutation.mutate(check.id)}
                          disabled={fixMutation.isPending}
                          className={cn(
                            'h-10 px-6 rounded-full font-bold shadow-lg shadow-primary/20 transition-all active:scale-95',
                            isError
                              ? 'bg-rose-500 hover:bg-rose-600'
                              : 'bg-amber-500 hover:bg-amber-600'
                          )}
                        >
                          {fixMutation.isPending ? (
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Wrench className="w-4 h-4 mr-2" />
                          )}
                          {t('health.applyFix')}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
