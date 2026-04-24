import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

function resolvePath(relativePath: string) {
  return path.resolve(import.meta.dir, relativePath);
}

describe('dev release workflow', () => {
  test('uses PAT_TOKEN for protected dev branch release pushes', () => {
    const workflowPath = resolvePath('../../../../.github/workflows/dev-release.yml');

    expect(fs.existsSync(workflowPath)).toBe(true);

    const workflow = fs.readFileSync(workflowPath, 'utf8');
    const checkoutSection = workflow.slice(
      workflow.indexOf('- name: Checkout'),
      workflow.indexOf('- name: Setup Bun')
    );
    const releaseSection = workflow.slice(
      workflow.indexOf('- name: Release'),
      workflow.indexOf('- name: Notify Discord')
    );

    expect(workflow).toContain('name: Dev Release');
    expect(workflow).toContain('branches: [dev]');
    expect(checkoutSection).toContain("token: ${{ secrets.PAT_TOKEN }}");
    expect(checkoutSection).not.toContain('token: ${{ github.token }}');
    expect(releaseSection).toContain('GITHUB_TOKEN: ${{ secrets.PAT_TOKEN }}');
    expect(releaseSection).toContain('GH_TOKEN: ${{ secrets.PAT_TOKEN }}');
    expect(releaseSection).not.toContain('GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    expect(releaseSection).not.toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
  });
});
