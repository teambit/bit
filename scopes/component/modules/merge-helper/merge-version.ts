import chalk from 'chalk';
import { BitError } from '@teambit/bit-error';
import { resolveConflictPrompt } from '@teambit/legacy.cli.prompts';

export const mergeOptionsCli = { o: 'ours', t: 'theirs', m: 'manual' };
export const MergeOptions = { ours: 'ours', theirs: 'theirs', manual: 'manual' };
export type MergeStrategy = keyof typeof MergeOptions;
export const FileStatus = {
  merged: chalk.green('auto-merged'),
  manual: chalk.red('CONFLICT'),
  binaryConflict: chalk.red('unchanged-BINARY-CONFLICT'),
  updated: chalk.green('updated'),
  added: chalk.green('added'),
  removed: chalk.green('removed'),
  overridden: chalk.yellow('overridden'),
  unchanged: chalk.green('unchanged'),
  remainDeleted: chalk.green('remain-deleted'),
  deletedConflict: chalk.red('CONFLICT-deleted-and-modified'),
};

export async function getMergeStrategyInteractive(): Promise<MergeStrategy> {
  try {
    const result = await resolveConflictPrompt();
    // @ts-expect-error AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return mergeOptionsCli[result.mergeStrategy];
  } catch {
    // probably user clicked ^C
    throw new BitError('the action has been canceled');
  }
}

export function getMergeStrategy(ours: boolean, theirs: boolean, manual: boolean): MergeStrategy | null | undefined {
  if ((ours && theirs) || (ours && manual) || (theirs && manual)) {
    throw new BitError('please choose only one of the following: ours, theirs or manual');
  }
  if (ours) return MergeOptions.ours as any;
  if (theirs) return MergeOptions.theirs as any;
  if (manual) return MergeOptions.manual as any;
  return null;
}
