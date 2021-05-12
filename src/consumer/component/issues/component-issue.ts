import { BitId } from '@teambit/legacy-bit-id';
import chalk from 'chalk';
import R from 'ramda';
import { MISSING_DEPS_SPACE } from '../../../constants';

export type StringsPerFilePath = { [filePath: string]: string[] };

export class ComponentIssue {
  description: string;
  data: any;
  isTagBlocker = true; // if true, it stops the tag process and shows the issue
  isCacheBlocker = true; // if true, it doesn't cache the component in the filesystem
  format(formatIssueFunc: FormatIssueFunc = componentIssueToString): string {
    if (!this.data || R.isEmpty(this.data)) return '';

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
