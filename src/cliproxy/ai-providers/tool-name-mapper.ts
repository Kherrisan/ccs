/**
 * Tool Name Mapper
 *
 * Bidirectional mapping class to track original ↔ sanitized tool names.
 * Used to restore original names in API responses after sanitization.
 *
 * Flow:
 * 1. Request: registerTools() sanitizes names and stores mapping
 * 2. Response: restoreToolUse() restores original names using mapping
 */

import { sanitizeToolName, type SanitizeResult } from './tool-name-sanitizer';

/** MCP tool definition from Claude API */
export interface Tool {
  name: string;
  description?: string;
  input_schema?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Tool use content block from Claude API response */
export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** Content block from Claude API response (union type) */
export interface ContentBlock {
  type: string;
  [key: string]: unknown;
}

/** Record of a sanitization change */
export interface SanitizationChange {
  original: string;
  sanitized: string;
}

/** Record of a hash collision */
export interface HashCollision {
  /** The base sanitized name before disambiguation */
  base: string;
  /** All original names that collided */
  originals: string[];
  /** The sanitized name used (after disambiguation) */
  sanitized: string;
}

/**
 * Bidirectional mapper for tool name sanitization.
 *
 * Maintains a per-request mapping between sanitized and original tool names.
 * Must be cleared between requests to avoid memory leaks.
 */
export class ToolNameMapper {
  /** Map from sanitized name → original name */
  private mapping: Map<string, string> = new Map();

  /** List of all changes made during registration */
  private changes: SanitizationChange[] = [];

  /** List of detected hash collisions */
  private collisions: HashCollision[] = [];

  /**
   * Register tools and sanitize their names.
   * Stores mapping for later restoration. On collision (two originals
   * sanitizing to the same name), disambiguates with a numeric suffix.
   *
   * @param tools Array of tool definitions
   * @returns Array of tools with sanitized names
   */
  registerTools(tools: Tool[]): Tool[] {
    return tools.map((tool) => {
      const result: SanitizeResult = sanitizeToolName(tool.name);
      let finalName = result.sanitized;

      // Check for collision regardless of whether the name changed.
      // An unchanged name can still collide with a previously sanitized name.
      const existingOriginal = this.mapping.get(finalName);
      if (existingOriginal && existingOriginal !== tool.name) {
        // Record collision for logging
        const existing = this.collisions.find((c) => c.base === finalName);
        if (existing) {
          if (!existing.originals.includes(tool.name)) {
            existing.originals.push(tool.name);
          }
        } else {
          this.collisions.push({
            base: finalName,
            originals: [existingOriginal, tool.name],
            sanitized: finalName,
          });
        }

        // Disambiguate: append _N suffix to make unique
        let suffix = 2;
        let disambiguated: string;
        do {
          disambiguated = `${finalName}_${suffix}`;
          suffix++;
        } while (this.mapping.has(disambiguated) && this.mapping.get(disambiguated) !== tool.name);

        finalName = disambiguated;
      }

      // Always register in mapping so later tools can detect collisions
      // even when this tool's name was unchanged
      this.mapping.set(finalName, tool.name);

      // Record change only if name actually changed
      if (finalName !== tool.name) {
        this.changes.push({
          original: tool.name,
          sanitized: finalName,
        });
      }

      return {
        ...tool,
        name: finalName,
      };
    });
  }

  /**
   * Restore original tool names in content blocks.
   * Looks for tool_use blocks and restores their names.
   *
   * @param content Array of content blocks from API response
   * @returns Array with restored tool names
   */
  restoreToolUse(content: ContentBlock[]): ContentBlock[] {
    return content.map((block) => {
      if (block.type !== 'tool_use') {
        return block;
      }

      // Type guard: we know this is a tool_use block
      const toolUseName = block.name as string | undefined;
      if (!toolUseName) {
        return block;
      }

      const originalName = this.mapping.get(toolUseName);

      if (originalName) {
        return {
          ...block,
          name: originalName,
        };
      }

      return block;
    });
  }

  /**
   * Restore tool name in a single tool_use block.
   * Useful for streaming responses.
   *
   * @param name The sanitized tool name
   * @returns Original name if mapped, otherwise the input name
   */
  restoreName(name: string): string {
    return this.mapping.get(name) ?? name;
  }

  /**
   * Check if any sanitization occurred during registration.
   */
  hasChanges(): boolean {
    return this.changes.length > 0;
  }

  /**
   * Get all sanitization changes for logging.
   */
  getChanges(): SanitizationChange[] {
    return [...this.changes];
  }

  /**
   * Get the number of tools that were sanitized.
   */
  getChangeCount(): number {
    return this.changes.length;
  }

  /**
   * Check if any hash collisions were detected.
   * Collisions occur when multiple original names map to the same sanitized name.
   */
  hasCollisions(): boolean {
    return this.collisions.length > 0;
  }

  /**
   * Get all detected hash collisions for logging/warning.
   */
  getCollisions(): HashCollision[] {
    return [...this.collisions];
  }

  /**
   * Clear all mappings. Call between requests.
   */
  clear(): void {
    this.mapping.clear();
    this.changes = [];
    this.collisions = [];
  }
}
