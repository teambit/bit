import { ComponentIssue } from './component-issue';

export class ImportNonMainFiles extends ComponentIssue {
  description = 'importing non-main files (the dependency should expose its API from the main file)';
  data: { [filePath: string]: string[] } = {};
  isCacheBlocker: false;
}
