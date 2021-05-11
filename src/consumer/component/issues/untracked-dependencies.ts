import chalk from 'chalk';
import R from 'ramda';
import { MISSING_DEPS_SPACE, MISSING_NESTED_DEPS_SPACE } from '../../../constants';
import { UntrackedFileDependencyEntry } from '../dependencies/dependency-resolver/dependencies-resolver';
import { ComponentIssue, formatTitle } from './component-issue';

export class UntrackedDependencies extends ComponentIssue {
  description = 'untracked file dependencies (use "bit add <file>" to track untracked files as components)';
  data: { [filePath: string]: UntrackedFileDependencyEntry } = {};
  format(): string {
    if (!this.data || R.isEmpty(this.data)) return '';

    return (
      formatTitle(this.description) +
      chalk.white(
        Object.keys(this.data)
          .map((k) => {
            let space = MISSING_DEPS_SPACE;
            if (this.data[k].nested) {
              space = MISSING_NESTED_DEPS_SPACE;
            }
            return `${space}${k} -> ${untrackedFilesComponentIssueToString(this.data[k])}`;
          })
          .join('\n')
      )
    );
  }
}

function untrackedFilesComponentIssueToString(value: UntrackedFileDependencyEntry) {
  const colorizedMap = value.untrackedFiles.map((curr) => {
    if (curr.existing) {
      return `${chalk.yellow(curr.relativePath)}`;
    }
    return curr.relativePath;
  });
  return colorizedMap.join(', ');
}
