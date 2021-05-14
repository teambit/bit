import chalk from 'chalk';
import { BitId } from '@teambit/legacy-bit-id';

export type StringsPerFilePath = { [filePath: string]: string[] };

export const MISSING_DEPS_SPACE_COUNT = 10;
export const MISSING_DEPS_SPACE = ' '.repeat(MISSING_DEPS_SPACE_COUNT);

export class ComponentIssue {
  description: string;
  data: any;
  isTagBlocker = true; // if true, it stops the tag process and shows the issue
  isCacheBlocker = true; // if true, it doesn't cache the component in the filesystem
  format(formatIssueFunc: FormatIssueFunc = componentIssueToString): string {
    return (
      formatTitle(this.description) +
      chalk.white(
        Object.keys(this.data)
          .map((k) => {
            return `${MISSING_DEPS_SPACE}${k} -> ${formatIssueFunc(this.data[k])}`;
          })
          .join('\n')
      )
    );
  }
  toObject() {
    return {
      type: this.constructor.name,
      description: this.description,
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
