import { normalizeSchemaForOpenAI } from '../../utils/schema-sanitizer';

interface AnthropicThinking {
  type?: 'enabled' | 'disabled' | 'adaptive' | string;
  budget_tokens?: number;
}

interface AnthropicTextBlock {
  type: 'text';
  text?: string;
}

interface AnthropicImageBlock {
  type: 'image';
  source?: {
    type?: string;
    media_type?: string;
    data?: string;
    url?: string;
  };
}

interface AnthropicToolUseBlock {
  type: 'tool_use';
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface AnthropicToolResultBlock {
  type: 'tool_result';
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicImageBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock
  | { type: string; [key: string]: unknown };

interface AnthropicMessage {
  role?: 'user' | 'assistant' | string;
  content?: string | AnthropicContentBlock[];
}

interface AnthropicOutputConfig {
  effort?: 'low' | 'medium' | 'high' | 'max' | string;
}

interface AnthropicProxyRequestShape {
  model?: unknown;
  system?: unknown;
  messages?: unknown;
  max_tokens?: unknown;
  temperature?: unknown;
  top_p?: unknown;
  stop_sequences?: unknown;
  metadata?: unknown;
  tools?: unknown;
  stream?: unknown;
  thinking?: AnthropicThinking;
  output_config?: AnthropicOutputConfig;
}

interface OpenAITextPart {
  type: 'text';
  text: string;
}

interface OpenAIImagePart {
  type: 'image_url';
  image_url: {
    url: string;
  };
}

type OpenAIContentPart = OpenAITextPart | OpenAIImagePart;

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | OpenAIContentPart[] | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface ProxyOpenAIRequest {
  model?: string;
  stream: boolean;
  reasoning_effort?: string;
  reasoning?: {
    enabled: boolean;
    effort: string;
  };
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description?: string;
      parameters: Record<string, unknown>;
    };
  }>;
  messages: OpenAIMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string[];
  metadata?: Record<string, unknown>;
}

const TOOL_USE_ARGUMENTS_FALLBACK = '{}';

function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`${label} must be an object`);
  }

  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const result = value.filter(
    (entry): entry is string => typeof entry === 'string' && entry.length > 0
  );
  return result.length > 0 ? result : undefined;
}

function asMetadata(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function safeJsonStringify(value: unknown, fallback: string): string {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === 'string' ? serialized : fallback;
  } catch {
    return fallback;
  }
}

function flattenTextContent(content: unknown, label: string): string {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    throw new Error(`${label} must be a string or content block array`);
  }

  return content
    .map((block, index) => {
      const parsed = assertObject(block, `${label}[${index}]`);
      if (parsed.type !== 'text') {
        throw new Error(`${label}[${index}].type "${String(parsed.type)}" is not supported`);
      }
      return typeof parsed.text === 'string' ? parsed.text : '';
    })
    .join('\n');
}

/**
 * Convert tool_result content to OpenAI-compatible format.
 * Handles strings, arrays with text/image blocks, and error prefixing.
 * Ported from openclaude's convertToolResultContent.
 */
function convertToolResultContent(
  content: unknown,
  isError: boolean
): string | OpenAIContentPart[] {
  if (content === undefined) {
    return '';
  }
  if (typeof content === 'string') {
    return isError ? `Error: ${content}` : content;
  }
  if (!Array.isArray(content)) {
    const text = safeJsonStringify(content, '[unserializable content]');
    return isError ? `Error: ${text}` : text;
  }

  const parts: OpenAIContentPart[] = [];
  for (const block of content) {
    if (block?.type === 'text' && typeof block.text === 'string') {
      parts.push({ type: 'text', text: block.text });
      continue;
    }

    if (block?.type === 'image') {
      const source = block.source;
      if (source?.type === 'url' && source.url) {
        parts.push({ type: 'image_url', image_url: { url: source.url } });
      } else if (source?.type === 'base64' && source.media_type && source.data) {
        parts.push({
          type: 'image_url',
          image_url: { url: `data:${source.media_type};base64,${source.data}` },
        });
      }
      continue;
    }

    if (typeof block?.text === 'string') {
      parts.push({ type: 'text', text: block.text });
    }
  }

  if (parts.length === 0) return '';
  if (parts.length === 1 && parts[0].type === 'text') {
    const text = (parts[0] as OpenAITextPart).text;
    return isError ? `Error: ${text}` : text;
  }
  if (isError && parts[0]?.type === 'text') {
    parts[0] = { ...parts[0], text: `Error: ${(parts[0] as OpenAITextPart).text}` };
  } else if (isError) {
    parts.unshift({ type: 'text', text: 'Error:' });
  }

  return parts;
}

function createFallbackToolId(messageIndex: number, blockIndex: number): string {
  return `toolu_proxy_fallback_${messageIndex}_${blockIndex}`;
}

function toImagePart(block: AnthropicImageBlock, label: string): OpenAIImagePart {
  const source = block.source;
  if (!source) {
    throw new Error(`${label}.source is missing`);
  }

  if (source.type === 'url' && source.url) {
    return {
      type: 'image_url',
      image_url: { url: source.url },
    };
  }

  if (source.type === 'base64' && source.media_type && source.data) {
    return {
      type: 'image_url',
      image_url: {
        url: `data:${source.media_type};base64,${source.data}`,
      },
    };
  }

  throw new Error(`${label}.source must be a base64 or url image payload`);
}

function isImageBlock(block: AnthropicContentBlock): block is AnthropicImageBlock {
  return block.type === 'image';
}

function isToolUseBlock(block: AnthropicContentBlock): block is AnthropicToolUseBlock {
  return block.type === 'tool_use';
}

function isToolResultBlock(block: AnthropicContentBlock): block is AnthropicToolResultBlock {
  return block.type === 'tool_result';
}

function flushUserContent(messages: OpenAIMessage[], parts: OpenAIContentPart[]): void {
  if (parts.length === 0) {
    return;
  }

  const onlyText = parts.every((part) => part.type === 'text');
  messages.push({
    role: 'user',
    content: onlyText ? parts.map((part) => (part as OpenAITextPart).text).join('\n') : [...parts],
  });
  parts.length = 0;
}

function transformTools(value: unknown): ProxyOpenAIRequest['tools'] {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const tools = value
    .filter(
      (entry): entry is { name?: unknown; description?: unknown; input_schema?: unknown } =>
        typeof entry === 'object' && entry !== null
    )
    .map((entry) => {
      const rawSchema =
        typeof entry.input_schema === 'object' && entry.input_schema !== null
          ? (entry.input_schema as Record<string, unknown>)
          : { type: 'object', properties: {} };

      return {
        type: 'function' as const,
        function: {
          name: typeof entry.name === 'string' ? entry.name : 'tool',
          ...(typeof entry.description === 'string' ? { description: entry.description } : {}),
          parameters: normalizeSchemaForOpenAI(rawSchema),
        },
      };
    });

  return tools.length > 0 ? tools : undefined;
}

function mapThinkingToReasoning(
  thinking: AnthropicThinking | undefined,
  outputConfig: AnthropicOutputConfig | undefined
): Pick<ProxyOpenAIRequest, 'reasoning' | 'reasoning_effort'> {
  if (!thinking || thinking.type === 'disabled') {
    return {};
  }

  if (thinking.type === 'adaptive') {
    const effort = toOpenAIEffort(resolveOutputConfigEffort(outputConfig) ?? 'high');
    return {
      reasoning_effort: effort,
      reasoning: {
        enabled: true,
        effort,
      },
    };
  }

  if (thinking.type !== 'enabled') {
    throw new Error('thinking.type must be "enabled", "adaptive", or "disabled"');
  }

  const effort =
    typeof thinking.budget_tokens === 'number' && thinking.budget_tokens >= 8192
      ? 'high'
      : 'medium';

  return {
    reasoning_effort: effort,
    reasoning: {
      enabled: true,
      effort,
    },
  };
}

const VALID_EFFORT_LEVELS = new Set(['low', 'medium', 'high', 'max']);

function resolveOutputConfigEffort(
  outputConfig: AnthropicOutputConfig | undefined
): string | undefined {
  if (!outputConfig || typeof outputConfig.effort !== 'string') {
    return undefined;
  }
  const normalized = outputConfig.effort.trim().toLowerCase();
  return VALID_EFFORT_LEVELS.has(normalized) ? normalized : undefined;
}

/**
 * Map Anthropic effort levels to OpenAI-compatible reasoning_effort.
 * Anthropic's `max` has no standard OpenAI equivalent — most providers
 * only accept low/medium/high and reject unknown values with a 400.
 * Ported from openclaude's standardEffortToOpenAI() which maps max -> xhigh
 * for Codex; for generic OpenAI-compat providers we clamp to high.
 */
function toOpenAIEffort(effort: string): string {
  return effort === 'max' ? 'high' : effort;
}

function transformMessages(messagesValue: unknown): OpenAIMessage[] {
  if (!Array.isArray(messagesValue)) {
    throw new Error('messages must be an array');
  }

  const translatedMessages: OpenAIMessage[] = [];

  messagesValue.forEach((message, messageIndex) => {
    const parsedMessage = assertObject(message, `messages[${messageIndex}]`) as AnthropicMessage;
    const role = parsedMessage.role;
    if (role !== 'user' && role !== 'assistant') {
      throw new Error(`messages[${messageIndex}].role must be "user" or "assistant"`);
    }

    const content = parsedMessage.content;
    if (typeof content === 'string') {
      translatedMessages.push({ role, content });
      return;
    }

    if (!Array.isArray(content)) {
      throw new Error(`messages[${messageIndex}].content must be a string or array`);
    }

    if (role === 'user') {
      const userParts: OpenAIContentPart[] = [];
      let sawToolResult = false;

      content.forEach((block, blockIndex) => {
        const parsed = assertObject(
          block,
          `messages[${messageIndex}].content[${blockIndex}]`
        ) as AnthropicContentBlock;

        if (parsed.type === 'thinking' || parsed.type === 'redacted_thinking') {
          return;
        }

        if (parsed.type === 'text') {
          const text = typeof parsed.text === 'string' ? parsed.text : '';
          userParts.push({ type: 'text', text });
          return;
        }

        if (isImageBlock(parsed)) {
          userParts.push(toImagePart(parsed, `messages[${messageIndex}].content[${blockIndex}]`));
          return;
        }

        if (isToolResultBlock(parsed)) {
          if (typeof parsed.tool_use_id !== 'string' || parsed.tool_use_id.trim().length === 0) {
            throw new Error(
              `messages[${messageIndex}].content[${blockIndex}].tool_use_id must be a non-empty string`
            );
          }
          sawToolResult = true;
          flushUserContent(translatedMessages, userParts);
          translatedMessages.push({
            role: 'tool',
            tool_call_id: parsed.tool_use_id,
            content: convertToolResultContent(parsed.content, parsed.is_error === true),
          });
          return;
        }

        if (isToolUseBlock(parsed)) {
          throw new Error(
            `messages[${messageIndex}].content[${blockIndex}] tool_use requires assistant role`
          );
        }

        throw new Error(
          `messages[${messageIndex}].content[${blockIndex}].type "${String(parsed.type)}" is not supported`
        );
      });

      if (userParts.length > 0 || !sawToolResult) {
        flushUserContent(translatedMessages, userParts);
      }
      return;
    }

    // Assistant role
    const assistantTextParts: string[] = [];
    const toolCalls: NonNullable<OpenAIMessage['tool_calls']> = [];

    content.forEach((block, blockIndex) => {
      const parsed = assertObject(
        block,
        `messages[${messageIndex}].content[${blockIndex}]`
      ) as AnthropicContentBlock;

      if (parsed.type === 'thinking' || parsed.type === 'redacted_thinking') {
        return;
      }

      if (parsed.type === 'text') {
        const text = typeof parsed.text === 'string' ? parsed.text : '';
        assistantTextParts.push(text);
        return;
      }

      if (isToolUseBlock(parsed)) {
        toolCalls.push({
          id:
            typeof parsed.id === 'string' && parsed.id.length > 0
              ? parsed.id
              : createFallbackToolId(messageIndex, blockIndex),
          type: 'function',
          function: {
            name: typeof parsed.name === 'string' ? parsed.name : 'tool',
            arguments: safeJsonStringify(parsed.input ?? {}, TOOL_USE_ARGUMENTS_FALLBACK),
          },
        });
        return;
      }

      if (isImageBlock(parsed)) {
        throw new Error(
          `messages[${messageIndex}].content[${blockIndex}] image requires user role`
        );
      }

      if (isToolResultBlock(parsed)) {
        throw new Error(
          `messages[${messageIndex}].content[${blockIndex}] tool_result requires user role`
        );
      }
    });

    if (assistantTextParts.length === 0 && toolCalls.length === 0) {
      return;
    }

    translatedMessages.push({
      role: 'assistant',
      content: assistantTextParts.join('\n'),
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    });
  });

  return translatedMessages;
}

/**
 * Coalesce consecutive messages of the same role.
 * OpenAI/vLLM/Ollama/Mistral require strict user<->assistant alternation.
 * Multiple consecutive tool messages are allowed (assistant -> tool* -> user).
 * Ported from openclaude's coalescing pass.
 */
function coalesceMessages(messages: OpenAIMessage[]): OpenAIMessage[] {
  const coalesced: OpenAIMessage[] = [];

  for (const msg of messages) {
    const prev = coalesced[coalesced.length - 1];

    if (prev && prev.role === msg.role && msg.role !== 'tool' && msg.role !== 'system') {
      const prevContent = prev.content;
      const curContent = msg.content;

      if (typeof prevContent === 'string' && typeof curContent === 'string') {
        prev.content = prevContent + (prevContent && curContent ? '\n' : '') + curContent;
      } else {
        const toArray = (
          c: string | OpenAIContentPart[] | null | undefined
        ): OpenAIContentPart[] => {
          if (!c) return [];
          if (typeof c === 'string') return c ? [{ type: 'text', text: c }] : [];
          return c;
        };
        prev.content = [...toArray(prevContent), ...toArray(curContent)];
      }

      if (msg.tool_calls?.length) {
        prev.tool_calls = [...(prev.tool_calls ?? []), ...msg.tool_calls];
      }
    } else {
      coalesced.push({ ...msg });
    }
  }

  return coalesced;
}

export class ProxyRequestTransformer {
  transform(raw: unknown): ProxyOpenAIRequest {
    const source = assertObject(raw || {}, 'request') as AnthropicProxyRequestShape;
    const messages = transformMessages(source.messages);
    const system = source.system;
    const allMessages =
      system !== undefined
        ? [
            { role: 'system', content: flattenTextContent(system, 'system') } as OpenAIMessage,
            ...messages,
          ]
        : messages;

    return {
      model:
        typeof source.model === 'string' && source.model.trim().length > 0
          ? source.model.trim()
          : undefined,
      stream: source.stream === true,
      messages: coalesceMessages(allMessages),
      max_tokens: asNumber(source.max_tokens),
      temperature: asNumber(source.temperature),
      top_p: asNumber(source.top_p),
      stop: asStringArray(source.stop_sequences),
      metadata: asMetadata(source.metadata),
      tools: transformTools(source.tools),
      ...mapThinkingToReasoning(source.thinking, source.output_config),
    };
  }
}
