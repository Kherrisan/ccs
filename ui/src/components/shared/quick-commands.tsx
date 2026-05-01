import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Check, Terminal } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface CommandSnippet {
  label: string;
  command: string;
  description: string;
}

const defaultSnippets: CommandSnippet[] = [
  {
    label: 'Start Default',
    command: 'ccs',
    description: 'Launch Claude with default profile',
  },
  {
    label: 'GLM Profile',
    command: 'ccs glm',
    description: 'Switch to GLM model',
  },
  {
    label: 'Health Check',
    command: 'ccs doctor',
    description: 'Run system diagnostics',
  },
  {
    label: 'Delegate Task',
    command: 'ccs glm -p "your task"',
    description: 'Delegate to GLM profile',
  },
];

interface QuickCommandsProps {
  snippets?: CommandSnippet[];
}

export function QuickCommands({ snippets = defaultSnippets }: QuickCommandsProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const { t } = useTranslation();

  const copyToClipboard = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Terminal className="w-5 h-5 text-muted-foreground" />
          {t('quickCommands.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {snippets.map((snippet, index) => (
            <div
              key={index}
              className={cn(
                'group flex items-center justify-between gap-2 px-3 py-2',
                'rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors'
              )}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">{snippet.label}</p>
                <code className="text-sm font-mono font-medium truncate block">
                  {snippet.command}
                </code>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => copyToClipboard(snippet.command, index)}
                title={snippet.description}
              >
                {copiedIndex === index ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
