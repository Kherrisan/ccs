import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

function resolvePath(relativePath: string) {
  return path.resolve(import.meta.dir, relativePath);
}

describe('sync dev after release workflow', () => {
  test('uses protected-branch runner and token settings', () => {
    const workflowPath = resolvePath('../../../../.github/workflows/sync-dev-after-release.yml');

    expect(fs.existsSync(workflowPath)).toBe(true);

    const workflow = fs.readFileSync(workflowPath, 'utf8');
    const checkoutSection = workflow.slice(
      workflow.indexOf('- name: Checkout'),
      workflow.indexOf('- name: Configure Git')
    );
    const syncSection = workflow.slice(workflow.indexOf('- name: Sync dev with main'));

    expect(workflow).toContain('name: Sync Dev After Main Release');
    expect(workflow).toContain('runs-on: [self-hosted, linux, x64]');
    expect(workflow).not.toContain('runs-on: ubuntu-latest');
    expect(checkoutSection).toContain('token: ${{ secrets.PAT_TOKEN }}');
    expect(checkoutSection).not.toContain('token: ${{ github.token }}');
    expect(syncSection).toContain(
      'git merge origin/main --no-edit -m "chore(sync): merge main into dev after release"'
    );
    expect(syncSection).not.toContain('[skip ci]');
    expect(syncSection).toContain('git push origin dev');
  });
});
