import { describe, expect, it } from 'bun:test';
import { createAnthropicProxyResponse } from '../../../../src/proxy/transformers/sse-stream-transformer';

describe('proxy SSE stream transformer', () => {
  it('converts OpenAI JSON into Anthropic message JSON', async () => {
    const response = new Response(
      JSON.stringify({
        id: 'chatcmpl_1',
        model: 'claude-sonnet-4.5',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Here is the result.',
              reasoning_content: 'Need to call the tool first.',
              tool_calls: [
                {
                  id: 'toolu_2',
                  type: 'function',
                  function: { name: 'search', arguments: '{"q":"proxy"}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const transformed = await createAnthropicProxyResponse(response);
    const body = (await transformed.json()) as {
      type: string;
      stop_reason: string;
      content: Array<{ type: string; thinking?: string; name?: string }>;
    };

    expect(body.type).toBe('message');
    expect(body.stop_reason).toBe('tool_use');
    expect(body.content.map((block) => block.type)).toEqual(['thinking', 'text', 'tool_use']);
    expect(body.content[0]?.thinking).toContain('Need to call the tool first');
    expect(body.content[2]?.name).toBe('search');
  });

  it('converts OpenAI SSE chunks into Anthropic SSE events', async () => {
    const openAISse = [
      'data: {"id":"chatcmpl_2","object":"chat.completion.chunk","created":1,"model":"claude-sonnet-4.5","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl_2","object":"chat.completion.chunk","created":1,"model":"claude-sonnet-4.5","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":1,"total_tokens":6}}\n\n',
      'data: [DONE]\n\n',
    ].join('');

    const transformed = await createAnthropicProxyResponse(
      new Response(openAISse, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    );

    const body = await transformed.text();
    expect(body).toContain('event: message_start');
    expect(body).toContain('event: content_block_start');
    expect(body).toContain('"type":"text_delta"');
    expect(body).toContain('event: message_stop');
  });
});
