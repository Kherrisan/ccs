import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

function loadWorkflow() {
  const workflowPath = path.resolve(import.meta.dir, '../../../../.github/workflows/ai-review.yml');
  return fs.readFileSync(workflowPath, 'utf8');
}

describe('ai-review workflow', () => {
  test('uses the claude-code-action reviewer path with glm-5.1 and PR-sha comment markers', () => {
    const workflow = loadWorkflow();

    expect(workflow).toContain('timeout-minutes: 20');
    expect(workflow).toContain('REVIEW_MODEL: glm-5.1');
    expect(workflow).toContain('ANTHROPIC_MODEL: glm-5.1');
    expect(workflow).toContain('ANTHROPIC_DEFAULT_OPUS_MODEL: glm-5.1');
    expect(workflow).toContain('ANTHROPIC_DEFAULT_SONNET_MODEL: glm-5.1');
    expect(workflow).toContain('ANTHROPIC_DEFAULT_HAIKU_MODEL: glm-5.1');
    expect(workflow).toContain('uses: anthropics/claude-code-action@v1');
    expect(workflow).toContain('--model ${{ env.REVIEW_MODEL }}');
    expect(workflow).toContain('--max-turns 45');
    expect(workflow).toContain('--json-schema');
    expect(workflow).toContain('normalize-ai-review-output.mjs');
    expect(workflow).not.toContain('build-ai-review-packet.mjs');
    expect(workflow).not.toContain('run-ai-review-direct.mjs');
    expect(workflow).toContain('pr:${{ needs.prepare.outputs.pr_number }}');
    expect(workflow).toContain('sha:${{ needs.prepare.outputs.head_sha }}');
    expect(workflow).not.toContain('run:${{ github.run_id }}');
  });
});
