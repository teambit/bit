import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { compact } from 'lodash';
import { WILDCARD_HELP, AUTO_SNAPPED_MSG, MergeConfigFilename } from '@teambit/legacy/dist/constants';
import {
  ApplyVersionResults,
  conflictSummaryReport,
  getMergeStrategy,
  applyVersionReport,
} from '@teambit/legacy/dist/consumer/versions-ops/merge-version';
import { isFeatureEnabled, BUILD_ON_CI } from '@teambit/legacy/dist/api/consumer/lib/feature-toggle';
import { BitError } from '@teambit/bit-error';
import { MergingMain } from './merging.main.runtime';
import { ConfigMergeResult } from './config-merge-result';

export class MergeCmd implements Command {
  name = 'merge [values...]';
  description = 'merge changes of different component versions';
  helpUrl = 'docs/components/merging-changes';
  group = 'development';
  extendedDescription = `merge changes of different component versions
  \`bit merge <version> [ids...]\` => merge changes of the given version into the checked out version
  \`bit merge [ids...]\` => EXPERIMENTAL. merge changes of the remote head into local, optionally use '--abort' or '--resolve'
  ${WILDCARD_HELP('merge 0.0.1')}`;
  alias = '';
  options = [
    ['', 'ours', 'in case of a conflict, override the used version with the current modification'],
    ['', 'theirs', 'in case of a conflict, override the current modification with the specified version'],
    ['', 'manual', 'in case of a conflict, leave the files with a conflict state to resolve them manually later'],
    ['', 'abort', 'EXPERIMENTAL. in case of an unresolved merge, revert to the state before the merge began'],
    ['', 'resolve', 'EXPERIMENTAL. mark an unresolved merge as resolved and create a new snap with the changes'],
    ['', 'no-snap', 'EXPERIMENTAL. do not auto snap in case the merge completed without conflicts'],
    ['', 'build', 'in case of snap during the merge, run the build-pipeline (similar to bit snap --build)'],
    ['', 'verbose', 'show details of components that were not merged legitimately'],
    ['', 'skip-dependency-installation', 'do not install packages of the imported components'],
    ['m', 'message <message>', 'EXPERIMENTAL. override the default message for the auto snap'],
  ] as CommandOptions;
  loader = true;

  constructor(private merging: MergingMain) {}

  async report(
    [values = []]: [string[]],
    {
      ours = false,
      theirs = false,
      manual = false,
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
      abort?: boolean;
      resolve?: boolean;
      build?: boolean;
      noSnap?: boolean;
      verbose?: boolean;
      message: string;
      skipDependencyInstallation?: boolean;
    }
  ) {
    build = isFeatureEnabled(BUILD_ON_CI) ? Boolean(build) : true;
    const mergeStrategy = getMergeStrategy(ours, theirs, manual);
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
      values,
      mergeStrategy as any,
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
  version,
  mergeSnapResults,
  mergeSnapError,
  leftUnresolvedConflicts,
  verbose,
  configMergeResults,
}: ApplyVersionResults & { configMergeResults?: ConfigMergeResult[] }): string {
  const getSuccessOutput = () => {
    if (!components || !components.length) return '';
    // @ts-ignore version is set in case of merge command
    const title = `successfully merged components${version ? `from version ${chalk.bold(version)}` : ''}\n`;
    // @ts-ignore components is set in case of merge command
    return chalk.underline(title) + chalk.green(applyVersionReport(components));
  };

  const getConflictSummary = () => {
    if (!components || !components.length || !leftUnresolvedConflicts) return '';
    const title = `\nfiles with conflicts summary\n`;
    const suggestion = `\n\nthe merge process wasn't completed due to the conflicts above. fix them manually and then run "bit install".
once ready, snap/tag the components to complete the merge.`;
    return chalk.underline(title) + conflictSummaryReport(components) + chalk.yellow(suggestion);
  };

  const configMergeWithConflicts = configMergeResults?.filter((c) => c.hasConflicts) || [];
  const getConfigMergeConflictSummary = () => {
    if (!configMergeWithConflicts.length) return '';
    const comps = configMergeWithConflicts.map((c) => c.compIdStr).join('\n');
    const title = `\ncomponents with config-merge conflicts\n`;
    const suggestion = `\nconflicts were found while trying to merge the config. fix them manually by editing the ${MergeConfigFilename} file in the component's dir.
once ready, snap/tag the components to complete the merge.`;
    return chalk.underline(title) + comps + chalk.yellow(suggestion);
  };

  const getSnapsOutput = () => {
    if (mergeSnapError) {
      return `
${chalk.bold(
  'snapping the merged components had failed with the following error, please fix the issues and snap manually'
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
          const autoTag = autoSnappedResults.filter((result) =>
            result.triggeredBy.searchWithoutScopeAndVersion(component.id)
          );
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
    )}\n(${'components that snapped as a result of the merge'})\n${outputComponents(snappedComponents)}\n`;
  };

  const getFailureOutput = () => {
    if (!failedComponents || !failedComponents.length) return '';
    const title = '\nthe merge has been skipped on the following component(s)';
    const body = compact(
      failedComponents.map((failedComponent) => {
        if (!verbose && failedComponent.unchangedLegitimately) return null;
        const color = failedComponent.unchangedLegitimately ? 'white' : 'red';
        return `${chalk.bold(failedComponent.id.toString())} - ${chalk[color](failedComponent.failureMessage)}`;
      })
    ).join('\n');
    if (!body) {
      return `${chalk.bold(`\nthe merge has been skipped on ${failedComponents.length} component(s) legitimately`)}
(use --verbose to list them next time)`;
    }
    return `\n${chalk.underline(title)}\n${body}\n\n`;
  };

  const getSummary = () => {
    const merged = components?.length || 0;
    const unchangedLegitimately = failedComponents?.filter((f) => f.unchangedLegitimately).length || 0;
    const failedToMerge = failedComponents?.filter((f) => !f.unchangedLegitimately).length || 0;
    const autoSnapped =
      (mergeSnapResults?.snappedComponents.length || 0) + (mergeSnapResults?.autoSnappedResults.length || 0);

    const newLines = '\n\n';
    const title = chalk.bold.underline('Merge Summary');
    const mergedStr = `\nTotal Merged: ${chalk.bold(merged.toString())}`;
    const unchangedLegitimatelyStr = `\nTotal Unchanged: ${chalk.bold(unchangedLegitimately.toString())}`;
    const failedToMergeStr = `\nTotal Failed: ${chalk.bold(failedToMerge.toString())}`;
    const autoSnappedStr = `\nTotal Snapped: ${chalk.bold(autoSnapped.toString())}`;

    return newLines + title + mergedStr + unchangedLegitimatelyStr + failedToMergeStr + autoSnappedStr;
  };

  return (
    getSuccessOutput() +
    getFailureOutput() +
    getSnapsOutput() +
    getConfigMergeConflictSummary() +
    getConflictSummary() +
    getSummary()
  );
}
