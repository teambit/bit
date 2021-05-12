import { ComponentIssue } from './component-issue';

export class ParseErrors extends ComponentIssue {
  description = 'error found while parsing the file (edit the file and fix the parsing error)';
  data: { [filePath: string]: string } = {};
  isCacheBlocker: false;
}
