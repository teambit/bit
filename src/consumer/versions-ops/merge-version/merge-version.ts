import chalk from 'chalk';
import { BitId } from '../../../bit-id';
import GeneralError from '../../../error/general-error';
import { resolveConflictPrompt } from '../../../prompts';

export const mergeOptionsCli = { o: 'ours', t: 'theirs', m: 'manual' };
export const MergeOptions = { ours: 'ours', theirs: 'theirs', manual: 'manual' };
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
};
// fileName is PathLinux. TS doesn't let anything else in the keys other than string and number
export type FilesStatus = { [fileName: string]: keyof typeof FileStatus };
export type FailedComponents = { id: BitId; failureMessage: string; unchangedLegitimately?: boolean };

export type ApplyVersionResult = { id: BitId; filesStatus: FilesStatus };

export async function getMergeStrategyInteractive(): Promise<MergeStrategy> {
  try {
    const result = await resolveConflictPrompt();
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return mergeOptionsCli[result.mergeStrategy];
  } catch (err: any) {
    // probably user clicked ^C
    throw new GeneralError('the action has been canceled');
  }
}

export function getMergeStrategy(ours: boolean, theirs: boolean, manual: boolean): MergeStrategy | null | undefined {
  if ((ours && theirs) || (ours && manual) || (theirs && manual)) {
    throw new GeneralError('please choose only one of the following: ours, theirs or manual');
  }
  if (ours) return MergeOptions.ours as any;
  if (theirs) return MergeOptions.theirs as any;
  if (manual) return MergeOptions.manual as any;
  return null;
}
