import { ComponentIssue, StringsPerFilePath } from './component-issue';

export class MissingPackagesDependenciesOnFs extends ComponentIssue {
  description = `missing packages or links from node_modules to the source (run "bit install" to fix both issues. if it's an external package, make sure it's added as a package dependency)`;

  data: StringsPerFilePath = {};
}
