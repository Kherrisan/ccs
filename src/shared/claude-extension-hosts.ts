export type ClaudeExtensionHost = 'vscode' | 'cursor' | 'windsurf';

export interface ClaudeExtensionHostDefinition {
  id: ClaudeExtensionHost;
  label: string;
  settingsKey: string;
  disableLoginPromptKey?: string;
  settingsTargetLabel: string;
  description: string;
}

export const CLAUDE_EXTENSION_HOSTS: ClaudeExtensionHostDefinition[] = [
  {
    id: 'vscode',
    label: 'VS Code',
    settingsKey: 'claudeCode.environmentVariables',
    disableLoginPromptKey: 'claudeCode.disableLoginPrompt',
    settingsTargetLabel: 'VS Code user or workspace settings.json',
    description: 'Official Anthropic VS Code extension with camelCase settings keys.',
  },
  {
    id: 'cursor',
    label: 'Cursor',
    settingsKey: 'claudeCode.environmentVariables',
    disableLoginPromptKey: 'claudeCode.disableLoginPrompt',
    settingsTargetLabel: 'Cursor user or workspace settings.json',
    description: 'VS Code-compatible host using the Anthropic extension schema.',
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    settingsKey: 'claude-code.environmentVariables',
    settingsTargetLabel: 'Windsurf user settings.json',
    description: 'Current Windsurf Anthropic extension build uses legacy kebab-case keys.',
  },
];

export function getClaudeExtensionHostDefinition(
  host: ClaudeExtensionHost = 'vscode'
): ClaudeExtensionHostDefinition {
  return (
    CLAUDE_EXTENSION_HOSTS.find((candidate) => candidate.id === host) ?? CLAUDE_EXTENSION_HOSTS[0]
  );
}
