import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

function resolvePath(relativePath: string) {
  return path.resolve(import.meta.dir, relativePath);
}

describe('PR-Agent review lane migration', () => {
  test('keeps ai-review.yml as the PR-Agent workflow on the self-hosted cliproxy runner', () => {
    const workflowPath = resolvePath('../../../../.github/workflows/ai-review.yml');
    const prAgentConfigPath = resolvePath('../../../../.pr_agent.toml');

    expect(fs.existsSync(workflowPath)).toBe(true);
    expect(fs.existsSync(prAgentConfigPath)).toBe(true);

    const workflow = fs.readFileSync(workflowPath, 'utf8');
    const config = fs.readFileSync(prAgentConfigPath, 'utf8');

    expect(workflow).toContain('name: AI Code Review');
    expect(workflow).toContain('runs-on: [self-hosted, cliproxy]');
    expect(workflow).toContain('uses: qodo-ai/pr-agent');
    expect(workflow).toContain('uses: actions/create-github-app-token@v1');
    expect(workflow).toContain('OPENAI.API_BASE');
    expect(workflow).toContain('OPENAI_KEY');
    expect(workflow).toContain('vars.AI_REVIEW_BASE_URL');
    expect(workflow).toContain('vars.AI_REVIEW_MODEL');
    expect(workflow).toContain('secrets.AI_REVIEW_API_KEY');
    expect(workflow).toContain('github_action_config.auto_review');
    expect(workflow).toContain("github.event.comment.body == '/review'");
    expect(workflow).toContain('github.event.comment.author_association');
    expect(workflow).toContain("format('skip-{0}', github.run_id)");
    expect(workflow).toContain("format('dispatch-{0}', github.run_id)");
    expect(workflow).toContain('CCS_REVIEWER_APP_ID');
    expect(workflow).toContain('CCS_REVIEWER_PRIVATE_KEY');
    expect(workflow).not.toContain('uses: anthropics/claude-code-action@v1');

    expect(config).toContain('[config]');
    expect(config).toContain('git_provider = "github"');
    expect(config).toContain('[pr_reviewer]');
    expect(config).not.toContain('auto_review = true');
    expect(config).not.toContain('claude-code-action');
  });
});
