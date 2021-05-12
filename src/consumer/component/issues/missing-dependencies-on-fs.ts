import { ComponentIssue } from './component-issue';

export class MissingDependenciesOnFs extends ComponentIssue {
  description = 'non-existing dependency files (make sure all files exists on your workspace)';
  data: { [filePath: string]: string[] } = {};
}
