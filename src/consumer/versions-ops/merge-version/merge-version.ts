import chalk from 'chalk';
import { compact } from 'lodash';
import { BitId } from '../../../bit-id';
import GeneralError from '../../../error/general-error';
import { resolveConflictPrompt } from '../../../prompts';
import { AutoTagResult } from '../../../scope/component-ops/auto-tag';
import Component from '../../component/consumer-component';

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
export type ApplyVersionResult = { id: BitId; filesStatus: FilesStatus };
export type FailedComponents = { id: BitId; failureMessage: string; unchangedLegitimately?: boolean };
export type ApplyVersionResults = {
  components?: ApplyVersionResult[];
  version?: string;
  failedComponents?: FailedComponents[];
  resolvedComponents?: Component[]; // relevant for bit merge --resolve
  abortedComponents?: ApplyVersionResult[]; // relevant for bit merge --abort
  mergeSnapResults?: { snappedComponents: Component[]; autoSnappedResults: AutoTagResult[] } | null;
  mergeSnapError?: Error;
  leftUnresolvedConflicts?: boolean;
  verbose?: boolean;
  newFromLane?: string[];
  newFromLaneAdded?: boolean;
};

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

export const applyVersionReport = (components: ApplyVersionResult[], addName = true, showVersion = false): string => {
  const tab = addName ? '\t' : '';
  return components
    .map((component: ApplyVersionResult) => {
      const name = showVersion ? component.id.toString() : component.id.toStringWithoutVersion();
      const files = Object.keys(component.filesStatus)
        .map((file) => {
          const note =
            component.filesStatus[file] === FileStatus.manual
              ? chalk.white(
                  'automatic merge failed. please fix conflicts manually and then run "bit install" and "bit compile"'
                )
              : '';
          return `${tab}${component.filesStatus[file]} ${chalk.bold(file)} ${note}`;
        })
        .join('\n');
      return `${addName ? name : ''}\n${chalk.cyan(files)}`;
    })
    .join('\n\n');
};

export function conflictSummaryReport(components: ApplyVersionResult[]): string {
  const tab = '\t';
  return compact(
    components.map((component: ApplyVersionResult) => {
      const name = component.id.toStringWithoutVersion();
      const files = compact(
        Object.keys(component.filesStatus).map((file) => {
          if (component.filesStatus[file] === FileStatus.manual) {
            return `${tab}${component.filesStatus[file]} ${chalk.bold(file)}`;
          }
          return null;
        })
      );
      if (!files.length) return null;

      return `${name}\n${chalk.cyan(files.join('\n'))}`;
    })
  ).join('\n');
}
