/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { merge } from '../../../api/consumer';
import type { ApplyVersionResults, ApplyVersionResult } from '../../../consumer/versions-ops/merge-version';
import { getMergeStrategy, FileStatus } from '../../../consumer/versions-ops/merge-version';

export const applyVersionReport = (
  components: ApplyVersionResult[],
  addName: boolean = true,
  showVersion: boolean = false
): string => {
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

export default class Merge extends Command {
  name = 'merge <version> <ids...>';
  description = `merge changes of different component versions
  the id can be used with wildcards (e.g. bit merge 0.0.1 "utils/*")`;
  alias = '';
  opts = [
    ['o', 'ours', 'in case of a conflict, override the used version with the current modification'],
    ['t', 'theirs', 'in case of a conflict, override the current modification with the specified version'],
    ['m', 'manual', 'in case of a conflict, leave the files with a conflict state to resolve them manually later']
  ];
  loader = true;

  action(
    [version, ids]: [string, string[]],
    {
      ours = false,
      theirs = false,
      manual = false
    }: {
      ours?: boolean,
      theirs?: boolean,
      manual?: boolean
    }
  ): Promise<ApplyVersionResults> {
    const mergeStrategy = getMergeStrategy(ours, theirs, manual);
    return merge(version, ids, mergeStrategy);
  }

  report({ components, version }: ApplyVersionResults): string {
    // $FlowFixMe version is set in case of merge command
    const title = `successfully merged components from version ${chalk.bold(version)}\n`;
    // $FlowFixMe components is set in case of merge command
    const componentsStr = applyVersionReport(components);
    return chalk.underline(title) + chalk.green(componentsStr);
  }
}
