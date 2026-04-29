/**
 * Project Selection Handler
 *
 * Manages interactive project selection prompts during OAuth flow.
 * Parses CLIProxyAPI stdout for project lists and coordinates
 * between backend (stdin writer) and frontend (WebSocket/UI).
 */

import { EventEmitter } from 'events';

/**
 * Parsed project from CLIProxyAPI output
 */
export interface GCloudProject {
  id: string;
  name: string;
  index: number;
}

/**
 * Project selection prompt data sent to UI
 */
export interface ProjectSelectionPrompt {
  sessionId: string;
  provider: string;
  projects: GCloudProject[];
  defaultProjectId: string;
  supportsAll: boolean;
}

/**
 * Project selection response from UI
 */
export interface ProjectSelectionResponse {
  sessionId: string;
  selectedId: string; // Project ID or 'ALL'
}

/**
 * Pending project selection with resolver
 */
interface PendingSelection {
  prompt: ProjectSelectionPrompt;
  resolve: (value: string) => void;
  timeout: NodeJS.Timeout;
}

// Global event emitter for project selection events
export const projectSelectionEvents = new EventEmitter();

// Pending selections by session ID
const pendingSelections = new Map<string, PendingSelection>();

// Default timeout for project selection (30 seconds)
const SELECTION_TIMEOUT_MS = 30000;

/**
 * Parse project list from CLIProxyAPI stdout
 *
 * Expected format:
 * "Available Google Cloud projects:
 *  [1] project-id-123 (Project Name)
 *  [2] another-project (Another Name)
 *  Type 'ALL' to onboard every listed project."
 */
export function parseProjectList(output: string): GCloudProject[] {
  const projects: GCloudProject[] = [];

  // Match lines like: [1] project-id (Project Name)
  const projectRegex = /\[(\d+)\]\s+(\S+)\s+\(([^)]+)\)/g;
  let match;

  while ((match = projectRegex.exec(output)) !== null) {
    projects.push({
      index: parseInt(match[1], 10),
      id: match[2],
      name: match[3],
    });
  }

  return projects;
}

/**
 * Parse default project ID from prompt
 *
 * Expected format: "Enter project ID [default-project-id] or ALL:"
 */
export function parseDefaultProject(output: string): string | null {
  const match = output.match(/Enter project ID \[([^\]]+)\] or ALL:/);
  return match ? match[1] : null;
}

/**
 * Check if output contains project selection prompt
 */
export function isProjectSelectionPrompt(output: string): boolean {
  return output.includes('Enter project ID') && output.includes('or ALL:');
}

/**
 * Check if output contains project list
 */
export function isProjectList(output: string): boolean {
  return output.includes('Available Google Cloud projects:');
}

/**
 * Generate unique session ID for OAuth flow
 */
export function generateSessionId(): string {
  return `auth-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Request project selection from UI
 * Returns promise that resolves when user selects a project
 *
 * @param prompt - Project selection prompt data
 * @returns Promise<string> - Selected project ID or 'ALL', or default if timeout
 */
export function requestProjectSelection(prompt: ProjectSelectionPrompt): Promise<string> {
  return new Promise((resolve) => {
    // Set timeout for auto-selection
    const timeout = setTimeout(() => {
      const pending = pendingSelections.get(prompt.sessionId);
      if (pending) {
        pendingSelections.delete(prompt.sessionId);
        // Auto-select default on timeout
        resolve(prompt.defaultProjectId);
        projectSelectionEvents.emit('selection:timeout', prompt.sessionId);
      }
    }, SELECTION_TIMEOUT_MS);

    // Store pending selection
    pendingSelections.set(prompt.sessionId, {
      prompt,
      resolve,
      timeout,
    });

    // Emit event for WebSocket broadcast
    projectSelectionEvents.emit('selection:required', prompt);
  });
}

/**
 * Submit project selection from UI
 *
 * @param response - Selection response with session ID and selected project
 * @returns boolean - True if selection was accepted
 */
export function submitProjectSelection(response: ProjectSelectionResponse): boolean {
  const pending = pendingSelections.get(response.sessionId);

  if (!pending) {
    return false;
  }

  // Clear timeout and remove from pending
  clearTimeout(pending.timeout);
  pendingSelections.delete(response.sessionId);

  // Resolve the promise with selected ID
  pending.resolve(response.selectedId);
  projectSelectionEvents.emit('selection:submitted', response);

  return true;
}

/**
 * Cancel pending project selection
 */
export function cancelProjectSelection(sessionId: string): boolean {
  const pending = pendingSelections.get(sessionId);

  if (!pending) {
    return false;
  }

  clearTimeout(pending.timeout);
  pendingSelections.delete(sessionId);

  // Resolve with default (empty string to auto-select)
  pending.resolve('');
  projectSelectionEvents.emit('selection:cancelled', sessionId);

  return true;
}

/**
 * Get pending project selection prompt
 */
export function getPendingSelection(sessionId: string): ProjectSelectionPrompt | null {
  const pending = pendingSelections.get(sessionId);
  return pending ? pending.prompt : null;
}

/**
 * Check if there's a pending selection
 */
export function hasPendingSelection(sessionId: string): boolean {
  return pendingSelections.has(sessionId);
}

export default {
  parseProjectList,
  parseDefaultProject,
  isProjectSelectionPrompt,
  isProjectList,
  generateSessionId,
  requestProjectSelection,
  submitProjectSelection,
  cancelProjectSelection,
  getPendingSelection,
  hasPendingSelection,
  projectSelectionEvents,
};
