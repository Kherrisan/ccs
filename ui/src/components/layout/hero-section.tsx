import { Badge } from '@/components/ui/badge';
import { CcsLogo } from '@/components/shared/ccs-logo';

interface HeroSectionProps {
  version?: string;
}

export function HeroSection({ version }: HeroSectionProps) {
  return (
    <div className="flex items-center gap-4">
      <CcsLogo size="lg" showText={false} />
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">CCS Config</h1>
          {version && (
            <Badge variant="outline" className="font-mono text-xs">
              v{version}
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground text-sm mt-1">Claude Code Switch Dashboard</p>
      </div>
    </div>
  );
}
