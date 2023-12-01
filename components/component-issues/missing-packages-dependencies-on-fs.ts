import { ComponentIssue, ISSUE_FORMAT_SPACE } from './component-issue';

export type MissingPackagesData = {
  filePath: string;
  isDevFile: boolean;
  missingPackages: string[];
};

export class MissingPackagesDependenciesOnFs extends ComponentIssue {
  description = `missing packages or links from node_modules to the source`;
  solution = `run "bit install --add-missing-deps" to fix both issues`;
  data: MissingPackagesData[] = [];
  dataToString(): string {
    return this.data
      .map((d) => `${ISSUE_FORMAT_SPACE}${d.filePath} -> ${this.formatDataFunction(d.missingPackages)}`)
      .join('\n');
  }
}
