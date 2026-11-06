import { isReadOnlyCommand } from '@teambit/cli';

/**
 * The IDE polls bit constantly (status, show, lane info, etc.). Writing every one of these calls into
 * ".bit/command-history-ide" buries the operations that actually changed the workspace and grows the file
 * without limit. Only read-only operations are skipped; anything unknown is still logged.
 */

const READ_ONLY_IDE_METHODS = new Set([
  'catObject',
  'logFile',
  'blame',
  'changedFilesFromParent',
  'warmWorkspaceCache',
]);

/** commands that list when they run without a sub-command (e.g. "bit lane", "bit lane --json") */
const LISTING_COMMANDS = new Set(['lane', 'envs', 'env']);

/**
 * @param op the string written to the history: "<random-number> <ide-method>(<args>)" or
 * "<random-number> <command> [args] [flags]".
 */
export function isReadOnlyCmdHistoryOp(op: string): boolean {
  const [, first, second] = op.trim().split(/\s+/);
  if (!first) return false;
  const parenIndex = first.indexOf('(');
  if (parenIndex !== -1) {
    const method = first.slice(0, parenIndex);
    return /^(get|list)[A-Z]/.test(method) || READ_ONLY_IDE_METHODS.has(method);
  }
  if (isReadOnlyCommand(first, second)) return true;
  return LISTING_COMMANDS.has(first) && (!second || second.startsWith('-'));
}
