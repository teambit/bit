import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { ComponentID } from '@teambit/component-id';
import { compact } from 'lodash';
import {
  WILDCARD_HELP,
  AUTO_SNAPPED_MSG,
  MergeConfigFilename,
  FILE_CHANGES_CHECKOUT_MSG,
  CFG_FORCE_LOCAL_BUILD,
} from '@teambit/legacy/dist/constants';
import { FileStatus, MergeStrategy } from '@teambit/legacy/dist/consumer/versions-ops/merge-version';
import { GlobalConfigMain } from '@teambit/global-config';
import { ConfigMergeResult } from '@teambit/config-merger';
import { BitError } from '@teambit/bit-error';
import { ApplyVersionResults, MergingMain, ApplyVersionResult } from './merging.main.runtime';

export class MergeCmd implements Command {
  name = 'merge [ids...]';
  description = 'merge changes of the remote head into local - auto-snaps all merged components';
  helpUrl = 'reference/components/merging-changes';
  group = 'development';
  extendedDescription = `merge changes of the remote head into local when they are diverged. when on a lane, merge the remote head of the lane into the local
and creates snaps for merged components that have diverged, on the lane.
if no ids are specified, all pending-merge components will be merged. (run "bit status" to list them).
optionally use '--abort' to revert the last merge. to revert a lane merge, use "bit lane merge-abort" command.
${WILDCARD_HELP('merge')}`;
  alias = '';
  options = [
    ['', 'ours', 'DEPRECATED. use --auto-merge-resolve. in case of a conflict, keep the local modification'],
    [
      '',
      'theirs',
      'DEPRECATED. use --auto-merge-resolve. in case of a conflict, override the local modification with the specified version',
    ],
    ['', 'manual', 'DEPRECATED. use --auto-merge-resolve'],
    [
      '',
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

  constructor(private merging: MergingMain, private globalConfig: GlobalConfigMain) {}

  async report(
    [ids = []]: [string[]],
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
    build = (await this.globalConfig.getBool(CFG_FORCE_LOCAL_BUILD)) || Boolean(build);
    if (ours || theirs || manual) {
      throw new BitError(
        'the "--ours", "--theirs" and "--manual" flags are deprecated. use "--auto-merge-resolve" instead'
      );
    }
    if (
      autoMergeResolve &&
      autoMergeResolve !== 'ours' &&
      autoMergeResolve !== 'theirs' &&
      autoMergeResolve !== 'manual'
    ) {
      throw new BitError('--auto-merge-resolve must be one of the following: [ours, theirs, manual]');
    }
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
      ids,
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
  workspaceDepsUpdates,
  workspaceDepsConflicts,
  workspaceConflictError,
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
    const title = `\n\nfiles with conflicts summary\n`;
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
    const title = `\n\ncomponents with config-merge conflicts\n`;
    const suggestion = `\nconflicts were found while trying to merge the config. fix them manually by editing the ${MergeConfigFilename} file in the workspace root.
once ready, snap/tag the components to complete the merge.`;
    return chalk.underline(title) + comps + chalk.yellow(suggestion);
  };

  const getSnapsOutput = () => {
    if (mergeSnapError) {
      return `
${chalk.bold('snapping merged components failed with the following error, please fix the issues and snap manually')}
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

    return `\n${chalk.underline(
      'merge-snapped components'
    )}\n(${'components snapped as a result of the merge'})\n${outputComponents(snappedComponents)}\n`;
  };

  const getWorkspaceDepsOutput = () => {
    if (!workspaceDepsUpdates) return '';

    const title = '\nworkspace.jsonc has been updated with the following dependencies';
    const body = Object.keys(workspaceDepsUpdates)
      .map((pkgName) => {
        const [from, to] = workspaceDepsUpdates[pkgName];
        return `  ${pkgName}: ${from} => ${to}`;
      })
      .join('\n');

    return `\n${chalk.underline(title)}\n${body}\n\n`;
  };

  const getWorkspaceConflictsOutput = () => {
    if (!workspaceDepsConflicts && !workspaceConflictError) return '';
    if (workspaceConflictError) {
      return `\n${chalk.red(workspaceConflictError.message)}\n\n`;
    }
    return chalk.yellow('\nworkspace.jsonc has conflicts, please edit the file and fix them\n\n');
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
    return `\n${chalk.underline(title)}\n${body}\n\n`;
  };

  const getSummary = () => {
    const merged = components?.length || 0;
    const unchangedLegitimately = failedComponents?.filter((f) => f.unchangedLegitimately).length || 0;
    const autoSnapped =
      (mergeSnapResults?.snappedComponents.length || 0) + (mergeSnapResults?.autoSnappedResults.length || 0);
    const getConflictStr = () => {
      const comps = componentsWithConflicts ? `${componentsWithConflicts} components` : '';
      const ws = workspaceDepsConflicts ? 'workspace.jsonc file' : '';
      const mergeConfig = configMergeWithConflicts.length ? `${MergeConfigFilename} file` : '';
      return compact([comps, ws, mergeConfig]).join(', ');
    };

    const newLines = '\n\n';
    const title = chalk.bold.underline('Merge Summary');
    const mergedStr = `\nTotal Merged: ${chalk.bold(merged.toString())}`;
    const unchangedLegitimatelyStr = `\nTotal Unchanged: ${chalk.bold(unchangedLegitimately.toString())}`;
    const autoSnappedStr = `\nTotal Snapped: ${chalk.bold(autoSnapped.toString())}`;
    const removedStr = `\nTotal Removed: ${chalk.bold(removedComponents?.length.toString() || '0')}`;
    const conflictStr = `\nConflicts: ${chalk.bold(getConflictStr() || 'none')}`;

    return newLines + title + mergedStr + unchangedLegitimatelyStr + autoSnappedStr + removedStr + conflictStr;
  };

  return (
    getSuccessOutput() +
    getFailureOutput() +
    getRemovedOutput(removedComponents) +
    getSnapsOutput() +
    getWorkspaceDepsOutput() +
    getConfigMergeConflictSummary() +
    getWorkspaceConflictsOutput() +
    getConflictSummary() +
    getSummary()
  );
}

/**
 * shows only the file-changes section.
 * if all files are "unchanged", it returns an empty string
 */
export function applyVersionReport(components: ApplyVersionResult[], addName = true, showVersion = false): string {
  const tab = addName ? '\t' : '';
  const fileChanges = compact(
    components.map((component: ApplyVersionResult) => {
      const name = showVersion ? component.id.toString() : component.id.toStringWithoutVersion();
      const files = compact(
        Object.keys(component.filesStatus).map((file) => {
          if (component.filesStatus[file] === FileStatus.unchanged) return null;
          const note =
            component.filesStatus[file] === FileStatus.manual
              ? chalk.white('automatic merge failed. please fix conflicts manually and then run "bit install"')
              : '';
          return `${tab}${String(component.filesStatus[file])} ${chalk.bold(file)} ${note}`;
        })
      ).join('\n');
      if (!files) return null;
      return `${addName ? name : ''}\n${chalk.cyan(files)}`;
    })
  ).join('\n\n');
  if (!fileChanges) {
    return '';
  }
  const title = `\n${FILE_CHANGES_CHECKOUT_MSG}\n`;
  return chalk.underline(title) + fileChanges;
}

export function conflictSummaryReport(components: ApplyVersionResult[]): {
  conflictedComponents: number;
  conflictedFiles: number;
  conflictStr: string;
} {
  const tab = '\t';
  let conflictedComponents = 0;
  let conflictedFiles = 0;
  const conflictStr = compact(
    components.map((component: ApplyVersionResult) => {
      const name = component.id.toStringWithoutVersion();
      const files = compact(
        Object.keys(component.filesStatus).map((file) => {
          if (component.filesStatus[file] === FileStatus.manual) {
            conflictedFiles += 1;
            return `${tab}${String(component.filesStatus[file])} ${chalk.bold(file)}`;
          }
          return null;
        })
      );
      if (!files.length) return null;
      conflictedComponents += 1;
      return `${name}\n${chalk.cyan(files.join('\n'))}`;
    })
  ).join('\n');

  return { conflictedComponents, conflictedFiles, conflictStr };
}

export function installationErrorOutput(installationError?: Error) {
  if (!installationError) return '';
  const title = chalk.underline('Installation Error');
  const subTitle = 'The following error was thrown by the package manager, please fix the issue and run "bit install"';
  const body = chalk.red(installationError.message);
  return `\n\n${title}\n${subTitle}\n${body}`;
}

export function compilationErrorOutput(compilationError?: Error) {
  if (!compilationError) return '';
  const title = chalk.underline('Compilation Error');
  const subTitle = 'The following error was thrown by the compiler, please fix the issue and run "bit compile"';
  const body = chalk.red(compilationError.message);
  return `\n\n${title}\n${subTitle}\n${body}`;
}

export function getRemovedOutput(removedComponents?: ComponentID[]) {
  if (!removedComponents?.length) return '';
  const title = `the following ${removedComponents.length} component(s) have been removed`;
  const body = removedComponents.join('\n');
  return `\n\n${chalk.underline(title)}\n${body}\n\n`;
}

export function getAddedOutput(addedComponents?: ComponentID[]) {
  if (!addedComponents?.length) return '';
  const title = `the following ${addedComponents.length} component(s) have been added`;
  const body = addedComponents.join('\n');
  return `\n\n${chalk.underline(title)}\n${body}\n\n`;
}
