import chalk from 'chalk';

import { merge } from '../../../api/consumer';
import { WILDCARD_HELP } from '../../../constants';
import {
  ApplyVersionResult,
  ApplyVersionResults,
  FileStatus,
  getMergeStrategy,
} from '../../../consumer/versions-ops/merge-version';
import GeneralError from '../../../error/general-error';
import { CommandOptions, LegacyCommand } from '../../legacy-command';
import { AUTO_SNAPPED_MSG } from './snap-cmd';
import { isFeatureEnabled, BUILD_ON_CI } from '../../../api/consumer/lib/feature-toggle';
import { Group } from '../../command-groups';

export const applyVersionReport = (components: ApplyVersionResult[], addName = true, showVersion = false): string => {
  const tab = addName ? '\t' : '';
  return components
    .map((component: ApplyVersionResult) => {
      const name = showVersion ? component.id.toString() : component.id.toStringWithoutVersion();
      const files = Object.keys(component.filesStatus)
        .map((file) => {
          const note =
            component.filesStatus[file] === FileStatus.manual
              ? chalk.white('automatic merge failed. please fix conflicts manually and then tag the results.')
              : '';
          return `${tab}${component.filesStatus[file]} ${chalk.bold(file)} ${note}`;
        })
        .join('\n');
      return `${addName ? name : ''}\n${chalk.cyan(files)}`;
    })
    .join('\n\n');
};

export default class Merge implements LegacyCommand {
  name = 'merge [values...]';
  shortDescription = 'merge changes of different component versions';
  group: Group = 'development';
  description = `merge changes of different component versions
  bit merge <version> [ids...] => merge changes of the given version into the checked out version
  bit merge [ids...] => EXPERIMENTAL. merge changes of the remote head into local, optionally use '--abort' or '--resolve'
  bit merge <lane> --lane => EXPERIMENTAL. merge given lane into current lane
  bit merge <remote> <lane> --lane => EXPERIMENTAL. merge given remote-lane into current lane
  ${WILDCARD_HELP('merge 0.0.1')}`;
  alias = '';
  opts = [
    ['', 'ours', 'in case of a conflict, override the used version with the current modification'],
    ['', 'theirs', 'in case of a conflict, override the current modification with the specified version'],
    ['', 'manual', 'in case of a conflict, leave the files with a conflict state to resolve them manually later'],
    ['', 'abort', 'EXPERIMENTAL. in case of an unresolved merge, revert to the state before the merge began'],
    ['', 'resolve', 'EXPERIMENTAL. mark an unresolved merge as resolved and create a new snap with the changes'],
    ['l', 'lane', 'EXPERIMENTAL. merge lanes'],
    [
      '',
      'existing',
      'EXPERIMENTAL. relevant for lanes. checkout only components in a lane that exist in the workspace',
    ],
    ['', 'no-snap', 'EXPERIMENTAL. do not auto snap in case the merge completed without conflicts'],
    ['', 'build', 'in case of snap during the merge, run the build-pipeline (similar to bit snap --build)'],
    ['m', 'message <message>', 'EXPERIMENTAL. override the default message for the auto snap'],
  ] as CommandOptions;
  loader = true;

  action(
    [values]: [string[]],
    {
      ours = false,
      theirs = false,
      manual = false,
      abort = false,
      resolve = false,
      lane = false,
      build = false,
      noSnap = false,
      existing = false,
      message,
    }: {
      ours?: boolean;
      theirs?: boolean;
      manual?: boolean;
      abort?: boolean;
      resolve?: boolean;
      lane?: boolean;
      build?: boolean;
      noSnap?: boolean;
      existing?: boolean;
      message: string;
    }
  ): Promise<ApplyVersionResults> {
    build = isFeatureEnabled(BUILD_ON_CI) ? Boolean(build) : true;
    const mergeStrategy = getMergeStrategy(ours, theirs, manual);
    if (abort && resolve) throw new GeneralError('unable to use "abort" and "resolve" flags together');
    if (noSnap && message) throw new GeneralError('unable to use "noSnap" and "message" flags together');
    return merge(values, mergeStrategy as any, abort, resolve, lane, noSnap, message, existing, build);
  }

  report({
    components,
    failedComponents,
    version,
    resolvedComponents,
    abortedComponents,
    mergeSnapResults,
  }: ApplyVersionResults): string {
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
    const getSuccessOutput = () => {
      if (!components || !components.length) return '';
      // @ts-ignore version is set in case of merge command
      const title = `successfully merged components${version ? `from version ${chalk.bold(version)}` : ''}\n`;
      // @ts-ignore components is set in case of merge command
      return chalk.underline(title) + chalk.green(applyVersionReport(components));
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
      const title = 'the merge has been canceled on the following component(s)';
      const body = failedComponents
        .map(
          (failedComponent) =>
            `${chalk.bold(failedComponent.id.toString())} - ${chalk.red(failedComponent.failureMessage)}`
        )
        .join('\n');
      return `${chalk.underline(title)}\n${body}\n\n`;
    };

    return getSuccessOutput() + getFailureOutput() + getSnapsOutput();
  }
}
