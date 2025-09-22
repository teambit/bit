import chalk from 'chalk';
import { BitError } from '@teambit/bit-error';
import { prompt } from 'enquirer';

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
    const { mergeStrategy } = await prompt<{ mergeStrategy: 'o' | 't' | 'm' }>({
      type: 'select',
      name: 'mergeStrategy',
      message: 'Choose merge strategy:',
      choices: [
        { name: 'o', message: 'ours - use the current modified files' },
        { name: 't', message: 'theirs - use the specified version (and override the modification)' },
        {
          name: 'm',
          message:
            'manual - merge the modified files with the specified version and leave the files in a conflict state',
        },
      ],
    });
    return mergeOptionsCli[mergeStrategy] as MergeStrategy;
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
