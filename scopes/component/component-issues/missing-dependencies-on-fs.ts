import { ComponentIssue, StringsPerFilePath } from './component-issue';

export class MissingDependenciesOnFs extends ComponentIssue {
  description = 'non-existing dependency files';
  solution = 'make sure all files exists on your workspace';
  data: StringsPerFilePath = {};
}
