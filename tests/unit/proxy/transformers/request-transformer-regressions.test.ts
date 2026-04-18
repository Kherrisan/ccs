import { describe, expect, it } from 'bun:test';

import { ProxyRequestTransformer } from '../../../../src/proxy/transformers/request-transformer';

describe('ProxyRequestTransformer regressions', () => {
  it('drops assistant messages that only contain stripped thinking blocks', () => {
    const result = new ProxyRequestTransformer().transform({
      messages: [
        {
          role: 'assistant',
          content: [
            { type: 'thinking', text: 'internal' },
            { type: 'redacted_thinking', text: 'hidden' },
          ],
        },
      ],
    });

    expect(result.messages).toEqual([]);
  });

  it('maps adaptive thinking through output_config effort for OpenAI-compatible upstreams', () => {
    const result = new ProxyRequestTransformer().transform({
      messages: [{ role: 'user', content: 'hello' }],
      thinking: { type: 'adaptive' },
      output_config: { effort: 'max' },
    });

    expect(result.reasoning_effort).toBe('high');
    expect(result.reasoning).toEqual({ enabled: true, effort: 'high' });
  });

  it('rejects unsupported thinking types instead of silently dropping them', () => {
    expect(() =>
      new ProxyRequestTransformer().transform({
        messages: [{ role: 'user', content: 'hello' }],
        thinking: { type: 'typo' },
      })
    ).toThrow('thinking.type must be "enabled", "adaptive", or "disabled"');
  });

  it('keeps Anthropic role validation for tool_use, image, and tool_result blocks', () => {
    expect(() =>
      new ProxyRequestTransformer().transform({
        messages: [{ role: 'user', content: [{ type: 'tool_use', name: 'search', input: {} }] }],
      })
    ).toThrow('tool_use requires assistant role');

    expect(() =>
      new ProxyRequestTransformer().transform({
        messages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'image',
                source: { type: 'url', url: 'https://example.com/image.png' },
              },
            ],
          },
        ],
      })
    ).toThrow('image requires user role');

    expect(() =>
      new ProxyRequestTransformer().transform({
        messages: [
          {
            role: 'assistant',
            content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'nope' }],
          },
        ],
      })
    ).toThrow('tool_result requires user role');
  });

  it('translates url images and error tool results while coalescing repeated turns', () => {
    const result = new ProxyRequestTransformer().transform({
      messages: [
        {
          role: 'user',
          content: [{ type: 'image', source: { type: 'url', url: 'https://example.com/cat.png' } }],
        },
        { role: 'user', content: [{ type: 'text', text: 'Describe it' }] },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Checking' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'toolu_1', name: 'vision', input: { detail: 'high' } }],
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_1',
              is_error: true,
              content: [
                { type: 'text', text: 'fetch failed' },
                { type: 'image', source: { type: 'url', url: 'https://example.com/error.png' } },
              ],
            },
          ],
        },
      ],
    });

    expect(result.messages[0]).toEqual({
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: 'https://example.com/cat.png' } },
        { type: 'text', text: 'Describe it' },
      ],
    });
    expect(result.messages[1]).toEqual({
      role: 'assistant',
      content: 'Checking',
      tool_calls: [
        {
          id: 'toolu_1',
          type: 'function',
          function: {
            name: 'vision',
            arguments: '{"detail":"high"}',
          },
        },
      ],
    });
    expect(result.messages[2]).toEqual({
      role: 'tool',
      tool_call_id: 'toolu_1',
      content: [
        { type: 'text', text: 'Error: fetch failed' },
        { type: 'image_url', image_url: { url: 'https://example.com/error.png' } },
      ],
    });
  });
});
