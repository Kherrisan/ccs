import { describe, expect, it } from 'bun:test';
import {
  resolveOpenAIChatCompletionsUrl,
  resolveOpenAIModelsUrl,
} from '../../../src/proxy/upstream-url';

describe('OpenAI-compatible upstream URL resolution', () => {
  it('routes current OpenRouter API roots through /api/v1', () => {
    expect(resolveOpenAIChatCompletionsUrl('https://openrouter.ai/api/v1')).toBe(
      'https://openrouter.ai/api/v1/chat/completions'
    );
    expect(resolveOpenAIModelsUrl('https://openrouter.ai/api/v1')).toBe(
      'https://openrouter.ai/api/v1/models'
    );
  });

  it('repairs legacy OpenRouter /api roots before appending OpenAI endpoints', () => {
    expect(resolveOpenAIChatCompletionsUrl('https://openrouter.ai/api')).toBe(
      'https://openrouter.ai/api/v1/chat/completions'
    );
    expect(resolveOpenAIModelsUrl('https://openrouter.ai/api')).toBe(
      'https://openrouter.ai/api/v1/models'
    );
  });

  it('does not rewrite non-OpenRouter /api roots', () => {
    expect(resolveOpenAIChatCompletionsUrl('https://example.test/api')).toBe(
      'https://example.test/api/chat/completions'
    );
  });
});
