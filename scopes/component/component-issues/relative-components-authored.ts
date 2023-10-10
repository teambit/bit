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

  deserialize(dataStr: string) {
    const data = JSON.parse(dataStr);
    Object.keys(data).forEach((fileName) => {
      data[fileName] = data[fileName].map((record) => ({
        importSource: record.importSource,
        componentId: new ComponentID(record.componentId),
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
