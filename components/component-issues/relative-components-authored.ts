import { ComponentID } from '@teambit/component-id';
import { ComponentIssue } from './component-issue';

export type RelativeComponentsAuthoredEntry = {
  importSource: string;
  componentId: ComponentID;
  relativePath: {
    sourceRelativePath: string;
    importSpecifiers?: any[];
  };
};

export class RelativeComponentsAuthored extends ComponentIssue {
  description = 'components with relative import statements found';
  solution = 'replace to module paths or use "bit link --rewire" to replace';
  data: { [fileName: string]: RelativeComponentsAuthoredEntry[] } = {};
  isCacheBlocker = false;
  formatDataFunction = relativeComponentsAuthoredIssuesToString;

  serialize(): string {
    const obj = Object.keys(this.data).reduce((acc, fileName) => {
      acc[fileName] = this.data[fileName].map((record) => ({
        importSource: record.importSource,
        componentId: record.componentId.serialize(),
        relativePath: record.relativePath,
      }));
      return acc;
    }, {});
    return JSON.stringify(obj);
  }

  deserialize(dataStr: string) {
    const data = JSON.parse(dataStr);
    Object.keys(data).forEach((fileName) => {
      data[fileName] = data[fileName].map((record) => ({
        importSource: record.importSource,
        componentId: ComponentID.deserialize(record.componentId),
        relativePath: record.relativePath,
      }));
    });
    return data;
  }
}

function relativeComponentsAuthoredIssuesToString(relativeEntries: RelativeComponentsAuthoredEntry[]) {
  const stringifyEntry = (entry: RelativeComponentsAuthoredEntry) =>
    `"${entry.importSource}" (${entry.componentId.toString()})`;
  return relativeEntries.map(stringifyEntry).join(', ');
}
