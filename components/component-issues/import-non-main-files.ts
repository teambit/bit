import type { StringsPerFilePath } from './component-issue';
import { ComponentIssue } from './component-issue';

export class ImportNonMainFiles extends ComponentIssue {
  description = 'importing non-main files';
  solution = 'the dependency should expose its API from the main file';
  data: StringsPerFilePath = {};
  isCacheBlocker = false;
}
