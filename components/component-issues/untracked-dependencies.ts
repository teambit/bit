import chalk from 'chalk';
import { ComponentIssue, ISSUE_FORMAT_SPACE, ISSUE_FORMAT_SPACE_COUNT } from './component-issue';

export const MISSING_NESTED_DEPS_SPACE = ' '.repeat(ISSUE_FORMAT_SPACE_COUNT + 2);

interface UntrackedFileEntry {
  relativePath: string;
  existing: boolean;
}

export interface UntrackedFileDependencyEntry {
  nested: boolean;
  untrackedFiles: Array<UntrackedFileEntry>;
}

export class UntrackedDependencies extends ComponentIssue {
  description = 'untracked file dependencies';
  solution = 'use "bit add <file>" to track untracked files as components';
  data: { [filePath: string]: UntrackedFileDependencyEntry } = {};
  dataToString() {
    return Object.keys(this.data)
      .map((k) => {
        let space = ISSUE_FORMAT_SPACE;
        if (this.data[k].nested) {
          space = MISSING_NESTED_DEPS_SPACE;
        }
        return `${space}${k} -> ${untrackedFilesComponentIssueToString(this.data[k])}`;
      })
      .join('\n');
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
