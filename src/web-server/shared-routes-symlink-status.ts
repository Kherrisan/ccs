/**
 * Shared Routes — Symlink / copy status checker
 *
 * Reports whether shared resources (commands, skills, agents) under
 * ~/.ccs/shared/ are configured as symlinks pointing to ~/.claude/,
 * as directory copies (Windows fallback), or are missing.
 *
 * Return shape is a superset of the original { valid, message } so
 * existing callers remain unaffected while new callers can inspect
 * mode and per-link details.
 */

import * as fs from 'fs';
import * as path from 'path';

import { getClaudeConfigDir } from '../utils/claude-config-path';
import { getCcsDir } from '../config/config-loader-facade';

type LinkMode = 'symlink' | 'copy' | 'missing';

interface LinkDetail {
  mode: LinkMode;
}

interface SymlinkStatusResult {
  valid: boolean;
  message: string;
  /** Overall configuration mode derived from the three entries. */
  mode: 'symlink' | 'copy' | 'mixed' | 'none';
  /** Per-entry classification for diagnostics. */
  links: {
    commands: LinkMode;
    skills: LinkMode;
    agents: LinkMode;
  };
}

const SHARED_ENTRY_TYPES = ['commands', 'skills', 'agents'] as const;
type SharedEntryType = (typeof SHARED_ENTRY_TYPES)[number];

function classifyEntry(linkPath: string, expectedTarget: string): LinkMode {
  try {
    const lstats = fs.lstatSync(linkPath);

    if (lstats.isSymbolicLink()) {
      // Validate it points to the expected Claude config sub-directory.
      const target = fs.readlinkSync(linkPath);
      const resolvedTarget = path.resolve(path.dirname(linkPath), target);
      if (resolvedTarget === path.resolve(expectedTarget)) {
        return 'symlink';
      }
      // Symlink exists but points elsewhere — treat as missing for validity.
      return 'missing';
    }

    if (lstats.isDirectory()) {
      // Best-effort non-empty check to distinguish a real copy from an
      // accidental empty directory.
      try {
        const entries = fs.readdirSync(linkPath);
        if (entries.length > 0) {
          return 'copy';
        }
      } catch {
        // readdirSync failed — fall through to missing
      }
      return 'missing';
    }
  } catch {
    // lstatSync threw — path does not exist or is unreadable
  }

  return 'missing';
}

export function checkSymlinkStatus(): SymlinkStatusResult {
  const ccsDir = getCcsDir();
  const sharedDir = path.join(ccsDir, 'shared');
  const claudeConfigDir = getClaudeConfigDir();

  if (!fs.existsSync(sharedDir)) {
    return {
      valid: false,
      message: 'Shared directory not found',
      mode: 'none',
      links: { commands: 'missing', skills: 'missing', agents: 'missing' },
    };
  }

  const details: Record<SharedEntryType, LinkDetail> = {
    commands: { mode: 'missing' },
    skills: { mode: 'missing' },
    agents: { mode: 'missing' },
  };

  for (const entryType of SHARED_ENTRY_TYPES) {
    const linkPath = path.join(sharedDir, entryType);
    const expectedTarget = path.join(claudeConfigDir, entryType);

    if (!fs.existsSync(linkPath)) {
      details[entryType] = { mode: 'missing' };
      continue;
    }

    details[entryType] = { mode: classifyEntry(linkPath, expectedTarget) };
  }

  const modes = SHARED_ENTRY_TYPES.map((t) => details[t].mode);
  const links = {
    commands: details.commands.mode,
    skills: details.skills.mode,
    agents: details.agents.mode,
  };

  const allSymlink = modes.every((m) => m === 'symlink');
  const allCopy = modes.every((m) => m === 'copy');
  const allMissing = modes.every((m) => m === 'missing');

  if (allSymlink) {
    return { valid: true, message: 'Symlinks active', mode: 'symlink', links };
  }

  if (allCopy) {
    return {
      valid: true,
      message: 'Copies active (Windows fallback)',
      mode: 'copy',
      links,
    };
  }

  if (allMissing) {
    return { valid: false, message: 'Shared resources not configured', mode: 'none', links };
  }

  // Mixed — at least one differs from the others.
  const details_str = SHARED_ENTRY_TYPES.map((t) => `${t}:${details[t].mode}`).join(', ');
  return {
    valid: false,
    message: `Mixed configuration: ${details_str}`,
    mode: 'mixed',
    links,
  };
}
