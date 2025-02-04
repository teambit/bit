import chalk from 'chalk';
import { DEFAULT_LANE } from '@teambit/lane-id';
import { Command, CommandOptions } from '@teambit/cli';
import { compact } from 'lodash';
import { fromBase64 } from '@teambit/legacy.utils';
import { BitError } from '@teambit/bit-error';
import { MergeFromScopeResult, MergeLanesMain } from './merge-lanes.main.runtime';

type Flags = {
  pattern?: string;
  push?: boolean;
  build?: boolean;
  keepReadme?: boolean;
  noSquash: boolean;
  includeDeps?: boolean;
  title?: string;
  titleBase64?: string;
  reMerge?: boolean;
};

/**
 * private command. the underscore prefix is intended.
 */
export class MergeLaneFromScopeCmd implements Command {
  name = '_merge-lane <from-lane> [to-lane]';
  description = `merge a remote lane into another lane or main via a bare-scope (not workspace)`;
  extendedDescription = `to merge from a workspace, use "bit lane merge" command.
this is intended to use from the UI, which will have a button to merge an existing lane.
the lane must be up-to-date with the other lane, otherwise, conflicts might occur which are not handled in this command`;
  arguments = [
    {
      name: 'from-lane',
      description: `lane-id to merge from or "${DEFAULT_LANE}"`,
    },
    {
      name: 'to-lane',
      description: `lane-id to merge to. default is "${DEFAULT_LANE}"`,
    },
  ];
  alias = '';
  options = [
    ['', 'pattern <string>', 'partially merge the lane with the specified component-pattern'],
    [
      '',
      'title <string>',
      'if provided, it replaces the original message with this title and append squashed snaps messages',
    ],
    ['', 'title-base64 <string>', 'same as --title flag but the title is base64 encoded'],
    ['', 'push', 'export the updated objects to the original scopes once done'],
    ['', 'build', 'in case of snap during the merge, run the build-pipeline (similar to bit snap --build)'],
    ['', 'keep-readme', 'skip deleting the lane readme component after merging'],
    ['', 'no-squash', 'relevant for merging lanes into main, which by default squash.'],
    ['', 'include-deps', 'relevant for "--pattern". merge also dependencies of the given components'],
    ['', 're-merge', 'helpful when last merge failed during export. do not skip components that seemed to be merged'],
    ['j', 'json', 'output as json format'],
  ] as CommandOptions;
  loader = true;
  private = true;
  remoteOp = true;

  constructor(private mergeLanes: MergeLanesMain) {}

  async report(
    [fromLane, toLane]: [string, string],
    {
      pattern,
      push = false,
      build,
      keepReadme = false,
      noSquash = false,
      includeDeps = false,
      title,
      titleBase64,
      reMerge,
    }: Flags
  ): Promise<string> {
    if (includeDeps && !pattern) {
      throw new BitError(`"--include-deps" flag is relevant only for --pattern flag`);
    }
    if (fromLane === DEFAULT_LANE && !toLane) {
      throw new BitError('to merge from the main lane, specify the target lane');
    }

    const titleBase64Decoded = titleBase64 ? fromBase64(titleBase64) : undefined;

    const { mergedNow, unmerged, exportedIds, conflicts, mergeSnapError } = await this.mergeLanes.mergeFromScope(
      fromLane,
      toLane || DEFAULT_LANE,
      {
        push,
        build,
        keepReadme,
        noSquash,
        pattern,
        includeDeps,
        snapMessage: titleBase64Decoded || title,
        reMerge,
      }
    );

    const mergedTitle = chalk.green(
      `successfully merged ${mergedNow.length} components from ${fromLane} to ${toLane || DEFAULT_LANE}`
    );
    const mergedOutput = mergedNow.length ? `${mergedTitle}\n${mergedNow.join('\n')}` : '';

    const nonMergedTitle = chalk.bold(`the following ${unmerged.length} components were not merged`);
    const nonMergedOutput = unmerged.length
      ? `${nonMergedTitle}\n${unmerged.map((u) => `${u.id} (${u.reason})`).join('\n')}`
      : '';

    const conflictsTitle = chalk.bold(
      `the following ${conflicts?.length} components have conflicts, the merge was not completed`
    );
    const conflictsOutput = conflicts?.length
      ? `${conflictsTitle}\n${conflicts
          .map((u) => `${u.id} (files: ${u.files.join(', ') || 'N/A'}) (config: ${u.config})`)
          .join('\n')}`
      : '';

    const mergeSnapErrorTitle = chalk.bold(`the following error was thrown while snapping the components:`);
    const mergeSnapErrorOutput = mergeSnapError ? `${mergeSnapErrorTitle}\n${chalk.red(mergeSnapError.message)}` : '';

    const exportedTitle = chalk.bold(`successfully exported ${exportedIds.length} components`);
    const exportedOutput = exportedIds.length ? `${exportedTitle}\n${exportedIds.join('\n')}` : '';

    return compact([mergedOutput, nonMergedOutput, conflictsOutput, mergeSnapErrorOutput, exportedOutput]).join('\n\n');
  }
  async json(
    [fromLane, toLane]: [string, string],
    { pattern, push = false, keepReadme = false, noSquash = false, includeDeps = false, reMerge }: Flags
  ) {
    if (includeDeps && !pattern) {
      throw new BitError(`"--include-deps" flag is relevant only for --pattern flag`);
    }
    let results: MergeFromScopeResult;
    try {
      results = await this.mergeLanes.mergeFromScope(fromLane, toLane || DEFAULT_LANE, {
        push,
        keepReadme,
        noSquash,
        pattern,
        includeDeps,
        reMerge,
      });
      return {
        code: 0,
        data: {
          ...results,
          mergedNow: results.mergedNow.map((id) => id.toString()),
          mergedPreviously: results.mergedPreviously.map((id) => id.toString()),
          exportedIds: results.exportedIds.map((id) => id.toString()),
          unmerged: results.unmerged.map(({ id, reason }) => ({ id: id.toString(), reason })),
          conflicts: results.conflicts?.map(({ id, ...rest }) => ({ id: id.toString(), ...rest })),
          snappedIds: results.snappedIds?.map((id) => id.toString()),
          mergeSnapError: results.mergeSnapError
            ? { message: results.mergeSnapError.message, stack: results.mergeSnapError.stack }
            : undefined,
        },
      };
    } catch (err: any) {
      this.mergeLanes.logger.error('merge-lane-from-scope.json, error: ', err);
      return {
        code: 1,
        error: err.message,
      };
    }
  }
}
