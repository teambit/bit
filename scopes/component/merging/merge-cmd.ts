import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { WILDCARD_HELP, AUTO_SNAPPED_MSG } from '@teambit/legacy/dist/constants';
import {
  ApplyVersionResults,
  conflictSummaryReport,
  getMergeStrategy,
  applyVersionReport,
} from '@teambit/legacy/dist/consumer/versions-ops/merge-version';
import { isFeatureEnabled, BUILD_ON_CI } from '@teambit/legacy/dist/api/consumer/lib/feature-toggle';
import { BitError } from '@teambit/bit-error';
import { MergingMain } from './merging.main.runtime';

export class MergeCmd implements Command {
  name = 'merge [values...]';
  description = 'merge changes of different component versions';
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
      message,
    }: {
      ours?: boolean;
      theirs?: boolean;
      manual?: boolean;
      abort?: boolean;
      resolve?: boolean;
      build?: boolean;
      noSnap?: boolean;
      message: string;
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
    }: ApplyVersionResults = await this.merging.merge(
      values,
      mergeStrategy as any,
      abort,
      resolve,
      noSnap,
      message,
      build
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
    });
  }
}

export function mergeReport({
  components,
  failedComponents,
  version,
  mergeSnapResults,
  conflictsFound,
}: ApplyVersionResults): string {
  const getSuccessOutput = () => {
    if (!components || !components.length) return '';
    // @ts-ignore version is set in case of merge command
    const title = `successfully merged components${version ? `from version ${chalk.bold(version)}` : ''}\n`;
    // @ts-ignore components is set in case of merge command
    return chalk.underline(title) + chalk.green(applyVersionReport(components));
  };

  const getConflictSummary = () => {
    if (!components || !components.length || !conflictsFound) return '';
    const title = `files with conflicts summary\n`;
    const suggestion = `\n\nthe merge process wasn't completed due to the conflicts above. fix them manually and then run "bit install".
once ready, run "bit merge --resolve" to complete the merge.`;
    return chalk.underline(title) + conflictSummaryReport(components) + chalk.yellow(suggestion);
  };

  const getSnapsOutput = () => {
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
    const title = '\nthe merge has been canceled on the following component(s)';
    const body = failedComponents
      .map((failedComponent) => {
        const color = failedComponent.unchangedLegitimately ? 'white' : 'red';
        return `${chalk.bold(failedComponent.id.toString())} - ${chalk[color](failedComponent.failureMessage)}`;
      })
      .join('\n');
    return `\n${chalk.underline(title)}\n${body}\n\n`;
  };

  return getSuccessOutput() + getFailureOutput() + getSnapsOutput() + getConflictSummary();
}
