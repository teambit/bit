import { RelativeComponentsAuthoredEntry } from '../dependencies/dependency-resolver/dependencies-resolver';
import { ComponentIssue } from './component-issue';

export class relativeComponentsAuthored extends ComponentIssue {
  description =
    'components with relative import statements found (replace to module paths or use "bit link --rewire" to replace)';
  data: { [fileName: string]: RelativeComponentsAuthoredEntry[] } = {};
  isCacheBlocker: false;
  format() {
    return super.format(relativeComponentsAuthoredIssuesToString);
  }
}

function relativeComponentsAuthoredIssuesToString(relativeEntries: RelativeComponentsAuthoredEntry[]) {
  const stringifyEntry = (entry: RelativeComponentsAuthoredEntry) =>
    `"${entry.importSource}" (${entry.componentId.toString()})`;
  return relativeEntries.map(stringifyEntry).join(', ');
}
