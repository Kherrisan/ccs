import { describe, expect, it } from 'bun:test';
import { appendThirdPartyWebSearchToolArgs } from '../../../../src/utils/websearch/claude-tool-args';

const STEERING_PROMPT =
  'For web lookup or current-information requests, prefer the CCS MCP tool WebSearch instead of Bash/curl/http fetches. If the user explicitly wants shell commands, or WebSearch is unavailable or fails, you may fall back to Bash/network tools.';

describe('appendThirdPartyWebSearchToolArgs', () => {
  it('appends native WebSearch suppression and steering prompt when no tool flags are present', () => {
    expect(appendThirdPartyWebSearchToolArgs(['smoke'])).toEqual([
      'smoke',
      '--disallowedTools',
      'WebSearch',
      '--append-system-prompt',
      STEERING_PROMPT,
    ]);
  });

  it('does not append duplicate suppression or steering prompt when both are already present', () => {
    expect(
      appendThirdPartyWebSearchToolArgs([
        'smoke',
        '--disallowedTools',
        'WebSearch',
        '--append-system-prompt',
        STEERING_PROMPT,
      ])
    ).toEqual([
      'smoke',
      '--disallowedTools',
      'WebSearch',
      '--append-system-prompt',
      STEERING_PROMPT,
    ]);
  });

  it('detects comma-separated disallowed tool values', () => {
    expect(
      appendThirdPartyWebSearchToolArgs(['smoke', '--disallowedTools=Read,WebSearch'])
    ).toEqual([
      'smoke',
      '--disallowedTools=Read,WebSearch',
      '--append-system-prompt',
      STEERING_PROMPT,
    ]);
  });

  it('merges WebSearch into an existing space-separated disallowed tool flag', () => {
    expect(appendThirdPartyWebSearchToolArgs(['smoke', '--disallowedTools', 'Read'])).toEqual([
      'smoke',
      '--disallowedTools',
      'Read,WebSearch',
      '--append-system-prompt',
      STEERING_PROMPT,
    ]);
  });

  it('merges WebSearch into an existing equals-form disallowed tool flag', () => {
    expect(appendThirdPartyWebSearchToolArgs(['smoke', '--disallowedTools=Read'])).toEqual([
      'smoke',
      '--disallowedTools=Read,WebSearch',
      '--append-system-prompt',
      STEERING_PROMPT,
    ]);
  });

  it('preserves user-supplied append-system-prompt values and adds the CCS steering hint once', () => {
    expect(
      appendThirdPartyWebSearchToolArgs([
        'smoke',
        '--append-system-prompt',
        'User-provided instruction',
      ])
    ).toEqual([
      'smoke',
      '--append-system-prompt',
      'User-provided instruction',
      '--disallowedTools',
      'WebSearch',
      '--append-system-prompt',
      STEERING_PROMPT,
    ]);
  });

  it('does not duplicate the steering prompt when it already exists in equals form', () => {
    expect(
      appendThirdPartyWebSearchToolArgs([
        'smoke',
        '--disallowedTools',
        'WebSearch',
        `--append-system-prompt=${STEERING_PROMPT}`,
      ])
    ).toEqual([
      'smoke',
      '--disallowedTools',
      'WebSearch',
      `--append-system-prompt=${STEERING_PROMPT}`,
    ]);
  });

  it('does not consume positional args after a disallowed-tools flag value', () => {
    expect(
      appendThirdPartyWebSearchToolArgs(['--disallowedTools', 'Read', 'latest AI news'])
    ).toEqual([
      '--disallowedTools',
      'Read,WebSearch',
      'latest AI news',
      '--append-system-prompt',
      STEERING_PROMPT,
    ]);
  });

  it('injects synthetic flags before an end-of-options marker', () => {
    expect(appendThirdPartyWebSearchToolArgs(['--', 'latest AI news'])).toEqual([
      '--disallowedTools',
      'WebSearch',
      '--append-system-prompt',
      STEERING_PROMPT,
      '--',
      'latest AI news',
    ]);
  });

  it('inserts the WebSearch disallow value when the flag is present without one', () => {
    expect(appendThirdPartyWebSearchToolArgs(['--disallowedTools', '--verbose'])).toEqual([
      '--disallowedTools',
      'WebSearch',
      '--verbose',
      '--append-system-prompt',
      STEERING_PROMPT,
    ]);
  });
});
