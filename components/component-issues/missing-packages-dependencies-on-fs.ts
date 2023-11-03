import { ComponentIssue, StringsPerFilePath } from './component-issue';

export class MissingPackagesDependenciesOnFs extends ComponentIssue {
  description = `missing packages or links from node_modules to the source`;
  solution = `run "bit install --add-missing-deps" to fix both issues`;
  data: StringsPerFilePath = {};
}
