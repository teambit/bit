import { ComponentIssue } from './component-issue';

export class MissingPackagesDependenciesOnFs extends ComponentIssue {
  description =
    "missing packages dependencies (make sure you've added it to the package dependencies, and use `bit install` to make sure all package dependencies are installed. On Harmony, run also `bit compile`)";
  data: { [filePath: string]: string[] } = {};
}
