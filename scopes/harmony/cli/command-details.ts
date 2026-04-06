import fs from 'fs';
import path from 'path';
import { logger } from '@teambit/legacy.logger';

const DETAILS_FILE = 'last-command-details';

function getDetailsFilePath(): string | undefined {
  if (!logger.commandHistoryBasePath) return undefined;
  return path.join(logger.commandHistoryBasePath, DETAILS_FILE);
}

/**
 * Save expanded output so it can be retrieved later via `bit details`.
 * Uses sync fs operations to match the existing writeToCommandHistory pattern.
 */
export function saveCommandDetails(commandName: string, expandedOutput: string): void {
  const filePath = getDetailsFilePath();
  if (!filePath) return;
  try {
    const header = `# ${commandName} — ${new Date().toLocaleString()}\n\n`;
    fs.writeFileSync(filePath, header + expandedOutput);
  } catch {
    // never mind — non-critical
  }
}

/** Clear any previously saved details. Called at the start of every command. */
export function clearCommandDetails(): void {
  const filePath = getDetailsFilePath();
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // never mind
  }
}

/** Read previously saved details, or return null if none exist. */
export function readCommandDetails(): string | null {
  const filePath = getDetailsFilePath();
  if (!filePath) return null;
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}
