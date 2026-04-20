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

  it('rejects orphaned, incomplete, or mixed-order tool_result blocks', () => {
    expect(() =>
      new ProxyRequestTransformer().transform({
        messages: [
          {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'orphan' }],
          },
        ],
      })
    ).toThrow('tool_result requires a preceding assistant tool_use');

    expect(() =>
      new ProxyRequestTransformer().transform({
        messages: [
          {
            role: 'assistant',
            content: [
              { type: 'tool_use', id: 'toolu_1', name: 'search', input: { q: 'docs' } },
              { type: 'tool_use', id: 'toolu_2', name: 'open', input: { url: 'https://example.com' } },
            ],
          },
          {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'partial' }],
          },
        ],
      })
    ).toThrow('must provide tool_result blocks for all pending tool_use ids');

    expect(() =>
      new ProxyRequestTransformer().transform({
        messages: [
          {
            role: 'assistant',
            content: [{ type: 'tool_use', id: 'toolu_1', name: 'vision', input: { detail: 'high' } }],
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Here you go' },
              { type: 'tool_result', tool_use_id: 'toolu_1', content: 'result' },
            ],
          },
        ],
      })
    ).toThrow('text is not allowed before tool_result blocks for pending tool_use ids');

    expect(() =>
      new ProxyRequestTransformer().transform({
        messages: [
          {
            role: 'assistant',
            content: [{ type: 'tool_use', id: 'toolu_1', name: 'vision', input: { detail: 'high' } }],
          },
          {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'toolu_1', content: 'result' },
              { type: 'text', text: 'follow-up' },
            ],
          },
        ],
      })
    ).not.toThrow();

    expect(() =>
      new ProxyRequestTransformer().transform({
        messages: [
          {
            role: 'assistant',
            content: [
              { type: 'tool_use', id: 'toolu_1', name: 'search', input: { q: 'docs' } },
              { type: 'tool_use', id: 'toolu_2', name: 'open', input: { url: 'https://example.com' } },
            ],
          },
          {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'toolu_1', content: 'partial' },
              { type: 'text', text: 'follow-up' },
              { type: 'tool_result', tool_use_id: 'toolu_2', content: 'done' },
            ],
          },
        ],
      })
    ).toThrow('text is not allowed between tool_result blocks for pending tool_use ids');

    expect(() =>
      new ProxyRequestTransformer().transform({
        messages: [
          {
            role: 'assistant',
            content: [{ type: 'tool_use', id: 'toolu_1', name: 'vision', input: { detail: 'high' } }],
          },
          {
            role: 'user',
            content: 'plain follow-up',
          },
        ],
      })
    ).toThrow('must start with tool_result blocks for pending tool_use ids');
  });

  it('rejects tool_result content that cannot be represented as OpenAI tool text', () => {
    expect(() =>
      new ProxyRequestTransformer().transform({
        messages: [
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
                content: [{ type: 'image', source: { type: 'url', url: 'https://example.com/error.png' } }],
              },
            ],
          },
        ],
      })
    ).toThrow('type "image" is not supported in tool_result content');
  });

  it('rejects unsupported assistant blocks instead of silently dropping them', () => {
    expect(() =>
      new ProxyRequestTransformer().transform({
        messages: [
          {
            role: 'assistant',
            content: [{ type: 'server_tool_use', id: 'srv_1' }],
          },
        ],
      })
    ).toThrow('type "server_tool_use" is not supported');
  });

  it('translates url images and tool_choice while coalescing repeated turns', () => {
    const result = new ProxyRequestTransformer().transform({
      tool_choice: {
        type: 'tool',
        name: 'vision',
        disable_parallel_tool_use: true,
      },
      tools: [{ name: 'vision', description: 'Inspect image', input_schema: { type: 'object' } }],
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
              content: [{ type: 'text', text: 'fetch failed' }],
            },
          ],
        },
      ],
    });

    expect(result.tool_choice).toEqual({
      type: 'function',
      function: { name: 'vision' },
    });
    expect(result.parallel_tool_calls).toBe(false);

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
      content: 'Error: fetch failed',
    });
  });

  it('defaults tools to auto tool_choice when none is specified', () => {
    const result = new ProxyRequestTransformer().transform({
      messages: [{ role: 'user', content: 'hello' }],
      tools: [{ name: 'search', description: 'Search docs', input_schema: { type: 'object' } }],
    });

    expect(result.tool_choice).toBe('auto');
  });
});
