import chalk from 'chalk';
import type { Command, CommandOptions } from '@teambit/cli';
import { compact } from 'lodash';
import {
  COMPONENT_PATTERN_HELP,
  AUTO_SNAPPED_MSG,
  MergeConfigFilename,
  CFG_FORCE_LOCAL_BUILD,
} from '@teambit/legacy.constants';
import type { ConfigMergeResult } from '@teambit/config-merger';
import { BitError } from '@teambit/bit-error';
import {
  type MergeStrategy,
  type ApplyVersionResults,
  applyVersionReport,
  conflictSummaryReport,
  getRemovedOutput,
  getWorkspaceConfigUpdateOutput,
} from '@teambit/component.modules.merge-helper';
import type { MergingMain } from './merging.main.runtime';
import type { ConfigStoreMain } from '@teambit/config-store';

export class MergeCmd implements Command {
  name = 'merge [component-pattern]';
  description = 'merge diverged component history when local and remote have different versions';
  helpUrl = 'reference/components/merging-changes';
  group = 'version-control';
  arguments = [{ name: 'component-pattern', description: COMPONENT_PATTERN_HELP }];
  extendedDescription = `resolves diverged component history when both local and remote have created different snaps/tags from the same base version.
if no component pattern is specified, all pending-merge components will be merged (run 'bit status' to list them).
'bit status' will show diverged components and suggest either merging or resetting local changes.
preferred approach: use 'bit reset' to remove local versions, then 'bit checkout head' to get remote versions.
for lane-to-lane merging, use 'bit lane merge' instead.`;
  alias = '';
  options = [
    ['', 'ours', 'DEPRECATED. use --auto-merge-resolve. in case of a conflict, keep the local modification'],
    [
      '',
      'theirs',
      'DEPRECATED. use --auto-merge-resolve. in case of a conflict, override the local modification with the specified version',
    ],
    [
      '',
      'manual',
      'same as "--auto-merge-resolve manual". in case of merge conflict, write the files with the conflict markers',
    ],
    [
      'r',
      'auto-merge-resolve <merge-strategy>',
      'in case of a conflict, resolve according to the strategy: [ours, theirs, manual]',
    ],
    ['', 'abort', 'in case of an unresolved merge, revert to pre-merge state'],
    ['', 'resolve', 'mark an unresolved merge as resolved and create a new snap with the changes'],
    ['', 'no-snap', 'do not auto snap even if the merge completed without conflicts'],
    ['', 'build', 'in case of snap during the merge, run the build-pipeline (similar to bit snap --build)'],
    ['', 'verbose', 'show details of components that were not merged successfully'],
    ['x', 'skip-dependency-installation', 'do not install new dependencies resulting from the merge'],
    ['m', 'message <message>', 'override the default message for the auto snap'],
  ] as CommandOptions;
  loader = true;

  constructor(
    private merging: MergingMain,
    private configStore: ConfigStoreMain
  ) {}

  async report(
    [pattern]: [string],
    {
      ours = false,
      theirs = false,
      manual = false,
      autoMergeResolve,
      abort = false,
      resolve = false,
      build = false,
      noSnap = false,
      verbose = false,
      message,
      skipDependencyInstallation = false,
    }: {
      ours?: boolean;
      theirs?: boolean;
      manual?: boolean;
      autoMergeResolve?: MergeStrategy;
      abort?: boolean;
      resolve?: boolean;
      build?: boolean;
      noSnap?: boolean;
      verbose?: boolean;
      message: string;
      skipDependencyInstallation?: boolean;
    }
  ) {
    build = this.configStore.getConfigBoolean(CFG_FORCE_LOCAL_BUILD) || Boolean(build);
    if (ours || theirs) {
      throw new BitError('the "--ours" and "--theirs" flags are deprecated. use "--auto-merge-resolve" instead');
    }
    if (
      autoMergeResolve &&
      autoMergeResolve !== 'ours' &&
      autoMergeResolve !== 'theirs' &&
      autoMergeResolve !== 'manual'
    ) {
      throw new BitError('--auto-merge-resolve must be one of the following: [ours, theirs, manual]');
    }
    if (manual) autoMergeResolve = 'manual';
    if (abort && resolve) throw new BitError('unable to use "abort" and "resolve" flags together');
    if (noSnap && message) throw new BitError('unable to use "noSnap" and "message" flags together');
    const {
      components,
      failedComponents,
      version,
      resolvedComponents,
      abortedComponents,
      mergeSnapResults,
      mergeSnapError,
    }: ApplyVersionResults = await this.merging.merge(
      pattern,
      autoMergeResolve as any,
      abort,
      resolve,
      noSnap,
      message,
      build,
      skipDependencyInstallation
    );
    if (resolvedComponents) {
      const title = 'successfully resolved component(s)\n';
      const componentsStr = resolvedComponents.map((c) => c.id.toStringWithoutVersion()).join('\n');
      return chalk.underline(title) + chalk.green(componentsStr);
    }
    if (abortedComponents) {
      const title = 'successfully aborted the merge of the following component(s)\n';
      const componentsStr = abortedComponents.map((c) => c.id.toStringWithoutVersion()).join('\n');
      return chalk.underline(title) + chalk.green(componentsStr);
    }

    return mergeReport({
      components,
      failedComponents,
      version,
      mergeSnapResults,
      mergeSnapError,
      verbose,
    });
  }
}

export function mergeReport({
  components,
  failedComponents,
  removedComponents,
  version,
  mergeSnapResults,
  mergeSnapError,
  leftUnresolvedConflicts,
  verbose,
  configMergeResults,
  workspaceConfigUpdateResult,
}: ApplyVersionResults & { configMergeResults?: ConfigMergeResult[] }): string {
  const getSuccessOutput = () => {
    if (!components || !components.length) return '';
    const title = `successfully merged ${components.length} components${
      version ? `from version ${chalk.bold(version)}` : ''
    }\n`;
    const fileChangesReport = applyVersionReport(components);

    return chalk.bold(title) + fileChangesReport;
  };

  let componentsWithConflicts = 0;
  const getConflictSummary = () => {
    if (!components || !components.length || !leftUnresolvedConflicts) return '';
    const title = `files with conflicts summary\n`;
    const suggestion = `\n\nmerge process not completed due to the conflicts above. fix conflicts manually and then run "bit install".
once ready, snap/tag the components to complete the merge.`;
    const conflictSummary = conflictSummaryReport(components);
    componentsWithConflicts = conflictSummary.conflictedComponents;
    return chalk.underline(title) + conflictSummary.conflictStr + chalk.yellow(suggestion);
  };

  const configMergeWithConflicts = configMergeResults?.filter((c) => c.hasConflicts()) || [];
  const getConfigMergeConflictSummary = () => {
    if (!configMergeWithConflicts.length) return '';
    const comps = configMergeWithConflicts.map((c) => c.compIdStr).join('\n');
    const title = `components with config-merge conflicts\n`;
    const suggestion = `\nconflicts were found while trying to merge the config. fix them manually by editing the ${MergeConfigFilename} file in the workspace root.
once ready, snap/tag the components to complete the merge.`;
    return chalk.underline(title) + comps + chalk.yellow(suggestion);
  };

  const getSnapsOutput = () => {
    if (mergeSnapError) {
      return `${chalk.bold(
        'snapping merged components failed with the following error, please fix the issues and snap manually'
      )}
${mergeSnapError.message}
`;
    }
    if (!mergeSnapResults || !mergeSnapResults.snappedComponents) return '';
    const { snappedComponents, autoSnappedResults } = mergeSnapResults;
    const outputComponents = (comps) => {
      return comps
        .map((component) => {
          let componentOutput = `     > ${component.id.toString()}`;
          const autoTag = autoSnappedResults.filter((result) => result.triggeredBy.searchWithoutVersion(component.id));
          if (autoTag.length) {
            const autoTagComp = autoTag.map((a) => a.component.id.toString());
            componentOutput += `\n       ${AUTO_SNAPPED_MSG}: ${autoTagComp.join(', ')}`;
          }
          return componentOutput;
        })
        .join('\n');
    };

    return `${chalk.underline(
      'merge-snapped components'
    )}\n(${'components snapped as a result of the merge'})\n${outputComponents(snappedComponents)}`;
  };

  const getFailureOutput = () => {
    if (!failedComponents || !failedComponents.length) return '';
    const title = '\nmerge skipped for the following component(s)';
    const body = compact(
      failedComponents.map((failedComponent) => {
        // all failures here are "unchangedLegitimately". otherwise, it would have been thrown as an error
        if (!verbose) return null;
        return `${chalk.bold(failedComponent.id.toString())} - ${chalk.white(failedComponent.unchangedMessage)}`;
      })
    ).join('\n');
    if (!body) {
      return `${chalk.bold(`\nmerge skipped legitimately for ${failedComponents.length} component(s)`)}
(use --verbose to list them next time)`;
    }
    return `${chalk.underline(title)}\n${body}`;
  };

  const getSummary = () => {
    const merged = components?.length || 0;
    const unchangedLegitimately = failedComponents?.filter((f) => f.unchangedLegitimately).length || 0;
    const autoSnapped =
      (mergeSnapResults?.snappedComponents.length || 0) + (mergeSnapResults?.autoSnappedResults.length || 0);
    const getConflictStr = () => {
      const comps = componentsWithConflicts ? `${componentsWithConflicts} components` : '';
      const ws = workspaceConfigUpdateResult?.workspaceDepsConflicts ? 'workspace.jsonc file' : '';
      const mergeConfig = configMergeWithConflicts.length ? `${MergeConfigFilename} file` : '';
      return compact([comps, ws, mergeConfig]).join(', ');
    };

    const title = chalk.bold.underline('Merge Summary');
    const mergedStr = `\nTotal Merged: ${chalk.bold(merged.toString())}`;
    const unchangedLegitimatelyStr = `\nTotal Unchanged: ${chalk.bold(unchangedLegitimately.toString())}`;
    const autoSnappedStr = `\nTotal Snapped: ${chalk.bold(autoSnapped.toString())}`;
    const removedStr = `\nTotal Removed: ${chalk.bold(removedComponents?.length.toString() || '0')}`;
    const conflictStr = `\nConflicts: ${chalk.bold(getConflictStr() || 'none')}`;

    return title + mergedStr + unchangedLegitimatelyStr + autoSnappedStr + removedStr + conflictStr;
  };

  return compact([
    getSuccessOutput(),
    getFailureOutput(),
    getRemovedOutput(removedComponents),
    getSnapsOutput(),
    getConfigMergeConflictSummary(),
    getWorkspaceConfigUpdateOutput(workspaceConfigUpdateResult),
    getConflictSummary(),
    getSummary(),
  ]).join('\n\n');
}
