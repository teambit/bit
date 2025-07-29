import { ComponentIssue, StringsPerFilePath } from './component-issue';

export class ImportFromDirectory extends ComponentIssue {
  description = 'relative import from a directory';
  solution = 'change the import statement to a specific file';
  data: StringsPerFilePath = {};
  isCacheBlocker = false;
  isTagBlocker = false;
}
