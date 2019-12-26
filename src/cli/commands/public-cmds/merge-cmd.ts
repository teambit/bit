import chalk from 'chalk';
import Command from '../../command';
import { merge } from '../../../api/consumer';
import { ApplyVersionResults, ApplyVersionResult } from '../../../consumer/versions-ops/merge-version';
import { getMergeStrategy, FileStatus } from '../../../consumer/versions-ops/merge-version';
import { WILDCARD_HELP } from '../../../constants';
import GeneralError from '../../../error/general-error';
import { AUTO_SNAPPED_MSG } from './snap-cmd';

export const applyVersionReport = (components: ApplyVersionResult[], addName = true, showVersion = false): string => {
  const tab = addName ? '\t' : '';
  return components
    .map((component: ApplyVersionResult) => {
      const name = showVersion ? component.id.toString() : component.id.toStringWithoutVersion();
      const files = Object.keys(component.filesStatus)
        .map(file => {
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

export default class Merge extends Command {
  name = 'merge [values...]';
  description = `merge changes of different component versions
  bit merge <version> [ids...] => merge changes of the given version into the checked out version
  bit merge [ids...] => merge changes of the remote head into local, optionally use '--abort' or '--resolve'
  bit merge <lane> --lane => merge given lane into current lane
  bit merge <remote> <lane> --lane => merge given remote-lane into current lane
  ${WILDCARD_HELP('merge 0.0.1')}`;
  alias = '';
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  opts = [
    ['', 'ours', 'in case of a conflict, override the used version with the current modification'],
    ['', 'theirs', 'in case of a conflict, override the current modification with the specified version'],
    ['', 'manual', 'in case of a conflict, leave the files with a conflict state to resolve them manually later'],
    ['', 'abort', 'in case of an unresolved merge, revert to the state before the merge began'],
    ['', 'resolve', 'mark an unresolved merge as resolved and create a new snap with the changes'],
    ['l', 'lane', 'merge lanes'],
    ['', 'no-snap', 'do not auto snap in case the merge completed without conflicts'],
    ['m', 'message', 'override the default message for the auto snap']
  ];
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
      noSnap = false,
      message
    }: {
      ours?: boolean;
      theirs?: boolean;
      manual?: boolean;
      abort?: boolean;
      resolve?: boolean;
      lane?: boolean;
      noSnap?: boolean;
      message: string;
    }
  ): Promise<ApplyVersionResults> {
    const mergeStrategy = getMergeStrategy(ours, theirs, manual);
    if (abort && resolve) throw new GeneralError('unable to use "abort" and "resolve" flags together');
    return merge(values, mergeStrategy as any, abort, resolve, lane, noSnap, message);
  }

  report({
    components,
    version,
    resolvedComponents,
    abortedComponents,
    mergeSnapResults
  }: ApplyVersionResults): string {
    if (resolvedComponents) {
      const title = 'successfully resolved component(s)\n';
      const componentsStr = resolvedComponents.map(c => c.id.toStringWithoutVersion()).join('\n');
      return chalk.underline(title) + chalk.green(componentsStr);
    }
    if (abortedComponents) {
      const title = 'successfully aborted the merge of the following component(s)\n';
      const componentsStr = abortedComponents.map(c => c.id.toStringWithoutVersion()).join('\n');
      return chalk.underline(title) + chalk.green(componentsStr);
    }
    // @ts-ignore version is set in case of merge command
    const title = `successfully merged components${version ? `from version ${chalk.bold(version)}` : ''}\n`;
    // @ts-ignore components is set in case of merge command
    const componentsStr = applyVersionReport(components);

    const getSnapsOutput = () => {
      if (!mergeSnapResults || !mergeSnapResults.snappedComponents) return '';
      const { snappedComponents, autoSnappedResults } = mergeSnapResults;
      const outputComponents = comps => {
        return comps
          .map(component => {
            let componentOutput = `     > ${component.id.toString()}`;
            const autoTag = autoSnappedResults.filter(result =>
              result.triggeredBy.searchWithoutScopeAndVersion(component.id)
            );
            if (autoTag.length) {
              const autoTagComp = autoTag.map(a => a.component.toBitIdWithLatestVersion().toString());
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

    return chalk.underline(title) + chalk.green(componentsStr) + getSnapsOutput();
  }
}
