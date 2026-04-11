const SENSITIVE_KEY_PATTERN =
  /^(authorization|cookie|set-cookie|password|password_hash|secret|token|api[_-]?key|management[_-]?key)$/i;
const MAX_STRING_LENGTH = 2000;
const MAX_DEPTH = 5;

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }
  return `${value.slice(0, MAX_STRING_LENGTH)}...[truncated]`;
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (depth >= MAX_DEPTH) {
    return '[max-depth]';
  }

  if (typeof value === 'string') {
    return truncateString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncateString(value.message),
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1));
  }

  if (typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      sanitized[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? '[redacted]'
        : sanitizeValue(nestedValue, depth + 1);
    }
    return sanitized;
  }

  return String(value);
}

export function redactContext(
  context: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!context) {
    return {};
  }

  return sanitizeValue(context, 0) as Record<string, unknown>;
}
