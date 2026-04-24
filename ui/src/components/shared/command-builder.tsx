import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CopyIcon, PlayIcon, TerminalIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Command {
  id: string;
  command: string;
  description: string;
  category: string;
}

export function CommandBuilder() {
  const { t } = useTranslation();
  const [command, setCommand] = useState('');

  const commonCommands = useMemo<Command[]>(
    () => [
      {
        id: '1',
        command: 'ccs config',
        description: t('commandBuilder.cmdConfig'),
        category: 'Config',
      },
      {
        id: '2',
        command: 'ccs profile create --name my-profile',
        description: t('commandBuilder.cmdCreateProfile'),
        category: 'Profile',
      },
      {
        id: '3',
        command: 'ccs profile switch --name my-profile',
        description: t('commandBuilder.cmdSwitchProfile'),
        category: 'Profile',
      },
      {
        id: '4',
        command: 'ccs doctor',
        description: t('commandBuilder.cmdDoctor'),
        category: 'Diagnostics',
      },
      {
        id: '5',
        command: 'ccs cliproxy list',
        description: t('commandBuilder.cmdListProviders'),
        category: 'CLIProxy',
      },
      {
        id: '6',
        command: 'ccs cliproxy add --provider gemini --token YOUR_TOKEN',
        description: t('commandBuilder.cmdAddProvider'),
        category: 'CLIProxy',
      },
    ],
    [t]
  );

  // Derive filtered commands from command input and translated commonCommands
  const filteredCommands = useMemo(() => {
    if (!command) return commonCommands;
    return commonCommands.filter(
      (cmd) =>
        cmd.command.toLowerCase().includes(command.toLowerCase()) ||
        cmd.description.toLowerCase().includes(command.toLowerCase())
    );
  }, [commonCommands, command]);

  const handleCommandSelect = (cmd: string) => {
    setCommand(cmd);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(command);
  };

  const handleRun = () => {
    console.log('Running command:', command);
  };

  const categories = Array.from(new Set(commonCommands.map((cmd) => cmd.category)));

  return (
    <Card className="h-[400px] flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TerminalIcon className="w-5 h-5" />
          {t('commandBuilder.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col space-y-4">
        <div className="space-y-2">
          <Input
            placeholder={t('commandBuilder.searchPlaceholder')}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            className="font-mono"
          />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCopy} disabled={!command}>
              <CopyIcon className="w-4 h-4 mr-1" />
              {t('commandBuilder.copy')}
            </Button>
            <Button size="sm" onClick={handleRun} disabled={!command}>
              <PlayIcon className="w-4 h-4 mr-1" />
              {t('commandBuilder.run')}
            </Button>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {categories.map((category) => (
            <Badge
              key={category}
              variant="secondary"
              className="text-xs cursor-pointer hover:bg-secondary/80"
              onClick={() => {
                const categoryCommands = commonCommands.filter((cmd) => cmd.category === category);
                console.log(`${category} commands:`, categoryCommands);
              }}
            >
              {category}
            </Badge>
          ))}
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-2">
            {filteredCommands.map((cmd) => (
              <div
                key={cmd.id}
                className="p-3 rounded-lg border cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => handleCommandSelect(cmd.command)}
              >
                <div className="font-mono text-sm">{cmd.command}</div>
                <div className="text-xs text-muted-foreground mt-1">{cmd.description}</div>
                <Badge variant="outline" className="mt-2 text-xs">
                  {cmd.category}
                </Badge>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
