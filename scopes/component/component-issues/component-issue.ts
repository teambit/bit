import chalk from 'chalk';
import { BitId } from '@teambit/legacy-bit-id';

export type StringsPerFilePath = { [filePath: string]: string[] };

export const ISSUE_FORMAT_SPACE_COUNT = 10;
export const ISSUE_FORMAT_SPACE = ' '.repeat(ISSUE_FORMAT_SPACE_COUNT);

export class ComponentIssue {
  description: string; // issue description
  solution: string; // suggest how to fix the issue
  data: any;
  isTagBlocker = true; // if true, it stops the tag process and shows the issue
  isCacheBlocker = true; // if true, it doesn't cache the component in the filesystem
  isLegacyIssue = false;
  formatDataFunction: FormatIssueFunc = componentIssueToString;
  get descriptionWithSolution() {
    const solution = this.solution ? ` (${this.solution})` : '';
    return `${this.description}${solution}`;
  }
  outputForCLI(): string {
    return formatTitle(this.descriptionWithSolution) + chalk.white(this.dataToString());
  }
  dataToString(): string {
    return Object.keys(this.data)
      .map((k) => {
        return `${ISSUE_FORMAT_SPACE}${k} -> ${this.formatDataFunction(this.data[k])}`;
      })
      .join('\n');
  }
  toObject() {
    return {
      type: this.constructor.name,
      description: this.description,
      solution: this.solution,
      data: this.data,
    };
  }
  serialize(): string {
    return JSON.stringify(this.data);
  }
  deserialize(data: string) {
    return JSON.parse(data);
  }
}

export function formatTitle(issueTitle: string, hasMoreData = true): string {
  const colon = hasMoreData ? ':' : '';
  return chalk.yellow(`\n       ${issueTitle}${colon} \n`);
}

type FormatIssueFunc = (value: any) => string;

export function componentIssueToString(value: string[] | string) {
  return Array.isArray(value) ? value.join(', ') : value;
}

export function deserializeWithBitId(dataStr: string) {
  const data = JSON.parse(dataStr);
  Object.keys(data).forEach((filePath) => {
    data[filePath] = data[filePath].map((id) => new BitId(id));
  });
  return data;
}
