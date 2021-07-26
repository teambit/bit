import { ComponentIssue } from './component-issue';

export class ResolveErrors extends ComponentIssue {
  description = 'error found while resolving the file dependencies';
  solution = 'see the log for the full error';
  data: { [filePath: string]: string } = {};
}
