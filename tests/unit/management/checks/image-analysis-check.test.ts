import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getImageAnalysisConfig } from '../../../../src/config/unified-config-loader';
import { fixImageAnalysisConfig } from '../../../../src/management/checks/image-analysis-check';

describe('image-analysis-check', () => {
  let tempHome = '';
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-image-analysis-check-'));
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;

    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(path.join(ccsDir, 'instances', 'demo'), { recursive: true });
    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      [
        'version: 12',
        'image_analysis:',
        '  enabled: true',
        '  timeout: 5',
        '  provider_models: {}',
        '',
      ].join('\n'),
      'utf8'
    );
    fs.writeFileSync(
      path.join(ccsDir, 'glm.settings.json'),
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'https://proxy.example/api/provider/gemini',
            ANTHROPIC_AUTH_TOKEN: 'glm-token',
          },
          hooks: {
            PreToolUse: [
              {
                matcher: 'Read',
                hooks: [
                  {
                    type: 'command',
                    command: 'node "/home/kai/.ccs/hooks/image-analyzer-transformer.cjs"',
                    timeout: 65000,
                  },
                ],
              },
            ],
          },
        },
        null,
        2
      ) + '\n'
    );
    fs.writeFileSync(
      path.join(ccsDir, 'instances', 'demo', '.claude.json'),
      JSON.stringify(
        {
          mcpServers: {
            custom: {
              type: 'stdio',
              command: 'node',
              args: ['custom-server.cjs'],
              env: {},
            },
          },
        },
        null,
        2
      ) + '\n'
    );
  });

  afterEach(() => {
    if (originalCcsHome === undefined) {
      delete process.env.CCS_HOME;
    } else {
      process.env.CCS_HOME = originalCcsHome;
    }

    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('repairs invalid config, removes stale hooks, and syncs managed MCP entries into instances', async () => {
    const fixed = await fixImageAnalysisConfig();
    const ccsDir = path.join(tempHome, '.ccs');

    expect(fixed).toBe(true);

    const config = getImageAnalysisConfig();
    expect(config.timeout).toBe(60);
    expect(Object.keys(config.provider_models).length).toBeGreaterThan(0);

    const repairedSettings = JSON.parse(
      fs.readFileSync(path.join(ccsDir, 'glm.settings.json'), 'utf8')
    ) as {
      hooks?: { PreToolUse?: Array<{ matcher?: string }> };
    };
    expect(repairedSettings.hooks?.PreToolUse?.some((hook) => hook.matcher === 'Read') ?? false).toBe(
      false
    );

    const globalClaudeConfig = JSON.parse(
      fs.readFileSync(path.join(tempHome, '.claude.json'), 'utf8')
    ) as {
      mcpServers?: Record<string, unknown>;
    };
    expect(globalClaudeConfig.mcpServers?.['ccs-image-analysis']).toBeDefined();

    const instanceClaudeConfig = JSON.parse(
      fs.readFileSync(path.join(ccsDir, 'instances', 'demo', '.claude.json'), 'utf8')
    ) as {
      mcpServers?: Record<string, unknown>;
    };
    expect(instanceClaudeConfig.mcpServers?.custom).toEqual({
      type: 'stdio',
      command: 'node',
      args: ['custom-server.cjs'],
      env: {},
    });
    expect(instanceClaudeConfig.mcpServers?.['ccs-image-analysis']).toBeDefined();
  });
});
