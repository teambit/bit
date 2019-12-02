import chalk from 'chalk';
import Command from '../../command';
import { merge } from '../../../api/consumer';
import { ApplyVersionResults, ApplyVersionResult } from '../../../consumer/versions-ops/merge-version';
import { getMergeStrategy, FileStatus } from '../../../consumer/versions-ops/merge-version';
import { WILDCARD_HELP } from '../../../constants';
import GeneralError from '../../../error/general-error';

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
  bit merge <lane> => merge given lane into current lane
  bit merge [ids...] => merge changes of the remote head into local, optionally use '--abort' or '--resolve'
  ${WILDCARD_HELP('merge 0.0.1')}`;
  alias = '';
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  opts = [
    ['o', 'ours', 'in case of a conflict, override the used version with the current modification'],
    ['t', 'theirs', 'in case of a conflict, override the current modification with the specified version'],
    ['m', 'manual', 'in case of a conflict, leave the files with a conflict state to resolve them manually later'],
    ['', 'abort', 'in case of an unresolved merge, revert to the state before the merge began'],
    ['', 'resolve', 'mark an unresolved merge as resolved and create a new snap with the changes']
  ];
  loader = true;

  action(
    [values]: [string[]],
    {
      ours = false,
      theirs = false,
      manual = false,
      abort = false,
      resolve = false
    }: {
      ours?: boolean;
      theirs?: boolean;
      manual?: boolean;
      abort?: boolean;
      resolve?: boolean;
    }
  ): Promise<ApplyVersionResults> {
    const mergeStrategy = getMergeStrategy(ours, theirs, manual);
    if (abort && resolve) throw new GeneralError('unable to use "abort" and "resolve" flags together');
    return merge(values, mergeStrategy as any, abort, resolve);
  }

  report({ components, version, snappedComponents }: ApplyVersionResults): string {
    if (snappedComponents) {
      const title = 'successfully resolved components\n';
      const componentsStr = snappedComponents.map(c => c.id.toString()).join('\n');
      return chalk.underline(title) + chalk.green(componentsStr);
    }
    // @ts-ignore version is set in case of merge command
    const title = `successfully merged components${version ? `from version ${chalk.bold(version)}` : ''}\n`;
    // @ts-ignore components is set in case of merge command
    const componentsStr = applyVersionReport(components);
    return chalk.underline(title) + chalk.green(componentsStr);
  }
}
