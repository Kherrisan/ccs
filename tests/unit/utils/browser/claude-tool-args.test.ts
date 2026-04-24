import { describe, expect, it } from 'bun:test';
import { appendBrowserToolArgs } from '../../../../src/utils/browser/claude-tool-args';

const BROWSER_STEERING_PROMPT =
  'For DOM/screenshots/elements/page actions, prefer the CCS MCP Browser tool, reuse the configured running Chrome context whenever possible, and if the tool or context is unavailable, explain that clearly instead of pretending page state is available.';

describe('appendBrowserToolArgs', () => {
  it('appends the browser steering prompt when it is missing', () => {
    expect(appendBrowserToolArgs(['navigate'])).toEqual([
      'navigate',
      '--append-system-prompt',
      BROWSER_STEERING_PROMPT,
    ]);
  });

  it('does not append the prompt when it already exists in equals form', () => {
    expect(
      appendBrowserToolArgs([
        'navigate',
        `--append-system-prompt=${BROWSER_STEERING_PROMPT}`,
      ])
    ).toEqual(['navigate', `--append-system-prompt=${BROWSER_STEERING_PROMPT}`]);
  });

  it('does not append the prompt when it already exists in split-flag form', () => {
    expect(
      appendBrowserToolArgs([
        'navigate',
        '--append-system-prompt',
        BROWSER_STEERING_PROMPT,
      ])
    ).toEqual(['navigate', '--append-system-prompt', BROWSER_STEERING_PROMPT]);
  });

  it('inserts the prompt before the end-of-options terminator', () => {
    expect(appendBrowserToolArgs(['--', 'take screenshot'])).toEqual([
      '--append-system-prompt',
      BROWSER_STEERING_PROMPT,
      '--',
      'take screenshot',
    ]);
  });
});
