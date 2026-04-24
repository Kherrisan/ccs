import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Server } from 'http';
import { sharedRoutes } from '../../../src/web-server/shared-routes';

function createDirectorySymlink(targetDir: string, linkPath: string): void {
  const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';

  try {
    fs.symlinkSync(targetDir, linkPath, symlinkType as fs.symlink.Type);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EPERM' || code === 'EACCES') {
      throw new Error(
        `Symlink creation is not permitted in this environment (${code}) for ${linkPath}`
      );
    }
    throw error;
  }
}

function createFileSymlink(targetFile: string, linkPath: string): void {
  const symlinkType = process.platform === 'win32' ? 'file' : 'file';

  try {
    fs.symlinkSync(targetFile, linkPath, symlinkType as fs.symlink.Type);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EPERM' || code === 'EACCES') {
      throw new Error(
        `File symlink creation is not permitted in this environment (${code}) for ${linkPath}`
      );
    }
    throw error;
  }
}

async function getJson<T>(baseUrl: string, routePath: string): Promise<T> {
  const response = await fetch(`${baseUrl}${routePath}`);
  expect(response.status).toBe(200);
  return (await response.json()) as T;
}

describe('web-server shared-routes', () => {
  let server: Server;
  let baseUrl = '';
  let tempHome: string;
  let ccsDir: string;
  let originalCcsHome: string | undefined;
  let originalClaudeConfigDir: string | undefined;

  beforeAll(async () => {
    const app = express();
    app.use('/api/shared', sharedRoutes);

    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1');
      const handleError = (error: Error) => {
        reject(error);
      };

      server.once('error', handleError);
      server.once('listening', () => {
        server.off('error', handleError);
        resolve();
      });
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Unable to resolve test server port');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-shared-routes-test-'));
    originalCcsHome = process.env.CCS_HOME;
    originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
    process.env.CCS_HOME = tempHome;
    delete process.env.CLAUDE_CONFIG_DIR;

    ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(path.join(ccsDir, 'shared'), { recursive: true });
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }

    if (originalClaudeConfigDir !== undefined) {
      process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
    } else {
      delete process.env.CLAUDE_CONFIG_DIR;
    }

    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('lists symlinked skill directories', async () => {
    const sharedSkillsDir = path.join(ccsDir, 'shared', 'skills');
    fs.mkdirSync(sharedSkillsDir, { recursive: true });
    const targetDir = path.join(ccsDir, '.claude', 'skills', 'my-skill');
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(
      path.join(targetDir, 'SKILL.md'),
      [
        '---',
        'name: my-skill',
        'description: This skill handles daily maintenance workflows.',
        '---',
        '',
        '# My Skill',
        '',
        'My test skill body',
      ].join('\n')
    );

    const linkPath = path.join(sharedSkillsDir, 'my-skill');
    createDirectorySymlink(targetDir, linkPath);

    const payload = await getJson<{
      items: Array<{ name: string; type: string; description: string; path: string }>;
    }>(baseUrl, '/api/shared/skills');

    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      name: 'my-skill',
      type: 'skill',
    });
    expect(payload.items[0].description).toBe('This skill handles daily maintenance workflows.');
    expect(payload.items[0].path).toBe(linkPath);
  });

  it('lists symlinked agent directories', async () => {
    const sharedAgentsDir = path.join(ccsDir, 'shared', 'agents');
    fs.mkdirSync(sharedAgentsDir, { recursive: true });
    const targetDir = path.join(ccsDir, '.claude', 'agents', 'my-agent');
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'prompt.md'), 'My test agent prompt');

    const linkPath = path.join(sharedAgentsDir, 'my-agent');
    createDirectorySymlink(targetDir, linkPath);

    const payload = await getJson<{
      items: Array<{ name: string; type: string; description: string; path: string }>;
    }>(baseUrl, '/api/shared/agents');

    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      name: 'my-agent',
      type: 'agent',
    });
    expect(payload.items[0].description.length).toBeGreaterThan(0);
    expect(payload.items[0].path).toBe(linkPath);
  });

  it('lists file-based agents from symlinked ~/.claude/agents directory', async () => {
    const sharedAgentsDir = path.join(ccsDir, 'shared', 'agents');
    const claudeAgentsDir = path.join(ccsDir, '.claude', 'agents');
    fs.mkdirSync(claudeAgentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeAgentsDir, 'planner.md'),
      [
        '---',
        'description: Plans implementation phases and dependencies.',
        '---',
        '',
        '# Planner',
      ].join('\n')
    );
    createDirectorySymlink(claudeAgentsDir, sharedAgentsDir);

    const payload = await getJson<{
      items: Array<{ name: string; type: string; description: string; path: string }>;
    }>(baseUrl, '/api/shared/agents');

    expect(payload.items).toEqual([
      {
        name: 'planner',
        type: 'agent',
        description: 'Plans implementation phases and dependencies.',
        path: path.join(sharedAgentsDir, 'planner.md'),
      },
    ]);
  });

  it('lists command markdown files recursively', async () => {
    const commandsDir = path.join(ccsDir, 'shared', 'commands');
    fs.mkdirSync(path.join(commandsDir, 'mkt'), { recursive: true });
    fs.mkdirSync(path.join(commandsDir, 'engineer'), { recursive: true });

    fs.writeFileSync(
      path.join(commandsDir, 'mkt', 'campaign.md'),
      '# Campaign\n\nDraft campaign brief'
    );
    fs.writeFileSync(
      path.join(commandsDir, 'engineer', 'review.md'),
      ['---', 'description: Code review command for engineering workflows.', '---'].join('\n')
    );

    const payload = await getJson<{
      items: Array<{ name: string; type: string; description: string; path: string }>;
    }>(baseUrl, '/api/shared/commands');

    expect(payload.items).toEqual([
      {
        name: 'engineer/review',
        type: 'command',
        description: 'Code review command for engineering workflows.',
        path: path.join(commandsDir, 'engineer', 'review.md'),
      },
      {
        name: 'mkt/campaign',
        type: 'command',
        description: 'Draft campaign brief',
        path: path.join(commandsDir, 'mkt', 'campaign.md'),
      },
    ]);
  });

  it('returns an empty command list when shared commands directory is missing', async () => {
    const payload = await getJson<{
      items: Array<{ name: string; type: string; description: string; path: string }>;
    }>(baseUrl, '/api/shared/commands');

    expect(payload.items).toEqual([]);
  });

  it('returns full content for a shared command markdown file', async () => {
    const commandsDir = path.join(ccsDir, 'shared', 'commands');
    fs.mkdirSync(commandsDir, { recursive: true });
    const commandPath = path.join(commandsDir, 'review.md');
    fs.writeFileSync(commandPath, '# Review\n\nDetailed workflow steps');

    const payload = await getJson<{ content: string; contentPath: string }>(
      baseUrl,
      `/api/shared/content?type=commands&path=${encodeURIComponent(commandPath)}`
    );

    expect(payload.content).toContain('Detailed workflow steps');
    expect(payload.contentPath).toBe(fs.realpathSync(commandPath));
  });

  it('returns full content for a shared skill from SKILL.md', async () => {
    const skillsDir = path.join(ccsDir, 'shared', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    const skillTargetDir = path.join(ccsDir, '.claude', 'skills', 'planner-skill');
    fs.mkdirSync(skillTargetDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillTargetDir, 'SKILL.md'),
      [
        '---',
        'description: Plan things',
        '---',
        '',
        '# Planner Skill',
        '',
        'Full skill details',
      ].join('\n')
    );

    const linkPath = path.join(skillsDir, 'planner-skill');
    createDirectorySymlink(skillTargetDir, linkPath);

    const payload = await getJson<{ content: string; contentPath: string }>(
      baseUrl,
      `/api/shared/content?type=skills&path=${encodeURIComponent(linkPath)}`
    );

    expect(payload.content).toContain('Full skill details');
    expect(payload.contentPath).toBe(fs.realpathSync(path.join(skillTargetDir, 'SKILL.md')));
  });

  it('does not use markdown frontmatter fences as descriptions when frontmatter is malformed', async () => {
    const commandsDir = path.join(ccsDir, 'shared', 'commands');
    fs.mkdirSync(commandsDir, { recursive: true });

    fs.writeFileSync(
      path.join(commandsDir, 'broken-frontmatter.md'),
      ['---', '', '# Heading', '', 'Fallback body description'].join('\n')
    );

    const payload = await getJson<{
      items: Array<{ name: string; type: string; description: string; path: string }>;
    }>(baseUrl, '/api/shared/commands');

    expect(payload.items).toEqual([
      {
        name: 'broken-frontmatter',
        type: 'command',
        description: 'Fallback body description',
        path: path.join(commandsDir, 'broken-frontmatter.md'),
      },
    ]);
  });

  it('skips markdown files deeper than traversal depth limit', async () => {
    const commandsDir = path.join(ccsDir, 'shared', 'commands');
    let currentDir = commandsDir;
    for (let index = 0; index < 11; index += 1) {
      currentDir = path.join(currentDir, `depth-${index}`);
      fs.mkdirSync(currentDir, { recursive: true });
    }
    fs.writeFileSync(path.join(currentDir, 'too-deep.md'), 'This should be ignored');

    const payload = await getJson<{ items: Array<{ name: string }> }>(
      baseUrl,
      '/api/shared/commands'
    );

    expect(payload.items).toEqual([]);
  });

  it('skips oversized markdown files when extracting descriptions', async () => {
    const commandsDir = path.join(ccsDir, 'shared', 'commands');
    fs.mkdirSync(commandsDir, { recursive: true });

    const oversizedBody = `# Big\n\n${'x'.repeat(1024 * 1024)}`;
    fs.writeFileSync(path.join(commandsDir, 'oversized.md'), oversizedBody);
    fs.writeFileSync(path.join(commandsDir, 'safe.md'), 'Safe command description');

    const payload = await getJson<{
      items: Array<{ name: string; type: string; description: string; path: string }>;
    }>(baseUrl, '/api/shared/commands');

    expect(payload.items).toEqual([
      {
        name: 'safe',
        type: 'command',
        description: 'Safe command description',
        path: path.join(commandsDir, 'safe.md'),
      },
    ]);
  });

  it('ignores markdown files in shared skills root', async () => {
    const sharedSkillsDir = path.join(ccsDir, 'shared', 'skills');
    fs.mkdirSync(sharedSkillsDir, { recursive: true });
    fs.writeFileSync(path.join(sharedSkillsDir, 'CLAUDE.md'), 'not a skill directory');

    const payload = await getJson<{ items: Array<{ name: string }> }>(
      baseUrl,
      '/api/shared/skills'
    );
    expect(payload.items).toEqual([]);
  });

  it('ignores invalid command markdown entries and keeps valid files', async () => {
    const commandsDir = path.join(ccsDir, 'shared', 'commands');
    fs.mkdirSync(commandsDir, { recursive: true });
    fs.writeFileSync(path.join(commandsDir, 'build.md'), 'Run build command');
    fs.mkdirSync(path.join(commandsDir, 'directory.md'), { recursive: true });

    const linkedDirTarget = path.join(tempHome, 'linked-command-dir.md');
    fs.mkdirSync(linkedDirTarget, { recursive: true });
    const linkedDirPath = path.join(commandsDir, 'linked-dir.md');
    createDirectorySymlink(linkedDirTarget, linkedDirPath);

    const payload = await getJson<{
      items: Array<{ name: string; type: string; description: string; path: string }>;
    }>(baseUrl, '/api/shared/commands');

    expect(payload.items).toEqual([
      {
        name: 'build',
        type: 'command',
        description: 'Run build command',
        path: path.join(commandsDir, 'build.md'),
      },
    ]);
  });

  it('ignores skill symlink targets outside allowed roots', async () => {
    const skillsDir = path.join(ccsDir, 'shared', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    const outsideSkillDir = path.join(tempHome, 'external-skills', 'outside-skill');
    fs.mkdirSync(outsideSkillDir, { recursive: true });
    fs.writeFileSync(path.join(outsideSkillDir, 'SKILL.md'), 'Outside skill should be ignored');

    const linkPath = path.join(skillsDir, 'outside-skill');
    createDirectorySymlink(outsideSkillDir, linkPath);

    const payload = await getJson<{ items: Array<{ name: string }> }>(
      baseUrl,
      '/api/shared/skills'
    );
    expect(payload.items).toEqual([]);
  });

  it('ignores agent symlink targets outside allowed roots', async () => {
    const agentsDir = path.join(ccsDir, 'shared', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });

    const outsideAgentDir = path.join(tempHome, 'external-agents', 'outside-agent');
    fs.mkdirSync(outsideAgentDir, { recursive: true });
    fs.writeFileSync(path.join(outsideAgentDir, 'prompt.md'), 'Outside agent should be ignored');

    const linkPath = path.join(agentsDir, 'outside-agent');
    createDirectorySymlink(outsideAgentDir, linkPath);

    const payload = await getJson<{ items: Array<{ name: string }> }>(
      baseUrl,
      '/api/shared/agents'
    );
    expect(payload.items).toEqual([]);
  });

  it('ignores symlinked SKILL.md that escapes an allowed skill directory', async () => {
    const skillsDir = path.join(ccsDir, 'shared', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    const entryTargetDir = path.join(ccsDir, '.claude', 'skills', 'safe-skill');
    fs.mkdirSync(entryTargetDir, { recursive: true });

    const outsideMarkdown = path.join(tempHome, 'outside-skill.md');
    fs.writeFileSync(outsideMarkdown, 'Leaked content should never be read');
    createFileSymlink(outsideMarkdown, path.join(entryTargetDir, 'SKILL.md'));

    createDirectorySymlink(entryTargetDir, path.join(skillsDir, 'safe-skill'));

    const payload = await getJson<{ items: Array<{ name: string }> }>(
      baseUrl,
      '/api/shared/skills'
    );
    expect(payload.items).toEqual([]);
  });

  it('ignores symlinked command markdown targets outside commands root', async () => {
    const commandsDir = path.join(ccsDir, 'shared', 'commands');
    fs.mkdirSync(commandsDir, { recursive: true });

    const outsideMarkdown = path.join(tempHome, 'outside-command.md');
    fs.writeFileSync(outsideMarkdown, 'Outside command should not be read');
    createFileSymlink(outsideMarkdown, path.join(commandsDir, 'outside.md'));

    const payload = await getJson<{ items: Array<{ name: string }> }>(
      baseUrl,
      '/api/shared/commands'
    );
    expect(payload.items).toEqual([]);
  });

  it('rejects shared command content lookups that escape the commands root', async () => {
    const commandsDir = path.join(ccsDir, 'shared', 'commands');
    fs.mkdirSync(commandsDir, { recursive: true });

    const outsideMarkdown = path.join(tempHome, 'outside-command.md');
    fs.writeFileSync(outsideMarkdown, 'Outside command should not be read');
    const escapedLinkPath = path.join(commandsDir, 'outside.md');
    createFileSymlink(outsideMarkdown, escapedLinkPath);

    const response = await fetch(
      `${baseUrl}/api/shared/content?type=commands&path=${encodeURIComponent(escapedLinkPath)}`
    );
    expect(response.status).toBe(404);

    const payload = (await response.json()) as { error: string };
    expect(payload.error).toBe('Shared content not found');
  });

  it('returns 400 for invalid shared content query parameters', async () => {
    const missingType = await fetch(
      `${baseUrl}/api/shared/content?path=${encodeURIComponent('/tmp/a.md')}`
    );
    expect(missingType.status).toBe(400);

    const missingPath = await fetch(`${baseUrl}/api/shared/content?type=commands`);
    expect(missingPath.status).toBe(400);
  });

  it('ignores command file symlinks that escape into CCS_HOME/.claude/commands', async () => {
    const commandsDir = path.join(ccsDir, 'shared', 'commands');
    fs.mkdirSync(commandsDir, { recursive: true });

    const claudeCommandsDir = path.join(ccsDir, '.claude', 'commands');
    fs.mkdirSync(claudeCommandsDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeCommandsDir, 'borrowed.md'),
      'Borrowed command should be ignored'
    );

    fs.writeFileSync(path.join(commandsDir, 'local.md'), 'Local command stays visible');
    createFileSymlink(
      path.join(claudeCommandsDir, 'borrowed.md'),
      path.join(commandsDir, 'borrowed.md')
    );

    const payload = await getJson<{
      items: Array<{ name: string; type: string; description: string; path: string }>;
    }>(baseUrl, '/api/shared/commands');

    expect(payload.items).toEqual([
      {
        name: 'local',
        type: 'command',
        description: 'Local command stays visible',
        path: path.join(commandsDir, 'local.md'),
      },
    ]);
  });

  it('summary uses CLAUDE_CONFIG_DIR for symlink status and counts', async () => {
    const sharedDir = path.join(ccsDir, 'shared');
    const claudeConfigDir = path.join(tempHome, 'custom-claude');
    process.env.CLAUDE_CONFIG_DIR = claudeConfigDir;

    for (const linkType of ['commands', 'skills', 'agents']) {
      const targetDir = path.join(claudeConfigDir, linkType);
      fs.mkdirSync(targetDir, { recursive: true });

      const linkPath = path.join(sharedDir, linkType);
      createDirectorySymlink(targetDir, linkPath);
    }

    fs.writeFileSync(path.join(claudeConfigDir, 'commands', 'lint.md'), 'Run lint command');

    const skillDir = path.join(claudeConfigDir, 'skills', 'custom-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'Custom skill description');

    const agentDir = path.join(claudeConfigDir, 'agents', 'custom-agent');
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(path.join(agentDir, 'prompt.md'), 'Custom agent prompt');

    const payload = await getJson<{
      commands: number;
      skills: number;
      agents: number;
      total: number;
      symlinkStatus: { valid: boolean; message: string };
    }>(baseUrl, '/api/shared/summary');

    expect(payload.commands).toBe(1);
    expect(payload.skills).toBe(1);
    expect(payload.agents).toBe(1);
    expect(payload.total).toBe(3);
    expect(payload.symlinkStatus).toEqual({
      valid: true,
      message: 'Symlinks active',
    });
  });

  it('summary uses CCS_HOME fallback Claude path when CLAUDE_CONFIG_DIR is unset', async () => {
    const sharedDir = path.join(ccsDir, 'shared');
    const claudeConfigDir = path.join(tempHome, '.claude');

    for (const linkType of ['commands', 'skills', 'agents']) {
      const targetDir = path.join(claudeConfigDir, linkType);
      fs.mkdirSync(targetDir, { recursive: true });
      createDirectorySymlink(targetDir, path.join(sharedDir, linkType));
    }

    fs.writeFileSync(path.join(claudeConfigDir, 'commands', 'test.md'), 'Command description');

    const payload = await getJson<{
      symlinkStatus: { valid: boolean; message: string };
      commands: number;
    }>(baseUrl, '/api/shared/summary');

    expect(payload.commands).toBe(1);
    expect(payload.symlinkStatus).toEqual({
      valid: true,
      message: 'Symlinks active',
    });
  });
});
