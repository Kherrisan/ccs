import { execFile } from 'child_process';
import * as fs from 'fs';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const SQLITE_JSON_MAX_BUFFER = 10 * 1024 * 1024;

export type SqliteJsonRow = Record<string, unknown>;

function isCommandMissing(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const nodeError = error as Error & { code?: string };
  return nodeError.code === 'ENOENT' || /not found/i.test(nodeError.message);
}

export async function querySqliteJson(
  dbPath: string,
  sql: string
): Promise<SqliteJsonRow[] | null> {
  if (!fs.existsSync(dbPath)) {
    return [];
  }

  try {
    const { stdout } = await execFileAsync('sqlite3', ['-json', dbPath, sql], {
      maxBuffer: SQLITE_JSON_MAX_BUFFER,
    });
    const trimmed = stdout.trim();
    if (!trimmed) {
      return [];
    }

    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? (parsed as SqliteJsonRow[]) : [];
  } catch (error) {
    if (isCommandMissing(error)) {
      return null;
    }
    return [];
  }
}
