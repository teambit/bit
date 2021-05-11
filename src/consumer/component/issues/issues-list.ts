import { ComponentIssue } from './component-issue';
import { CustomModuleResolutionUsed } from './custom-module-resolution-used';
import { ImportNonMainFiles } from './import-non-main-files';
import { MissingComponents } from './missing-components';
import { MissingCustomModuleResolutionLinks } from './missing-custom-module-resolution-links';
import { MissingDependenciesOnFs } from './missing-dependencies-on-fs';
import { MissingDists } from './missing-dists';
import { MissingLinks } from './missing-links';
import { MissingPackagesDependenciesOnFs } from './missing-packages-dependencies-on-fs';
import { ParseErrors } from './parse-errors';
import { relativeComponents } from './relative-components';
import { relativeComponentsAuthored } from './relative-components-authored';
import { ResolveErrors } from './resolve-errors';
import { UntrackedDependencies } from './untracked-dependencies';

export const IssuesClasses = {
  MissingPackagesDependenciesOnFs,
  MissingComponents,
  UntrackedDependencies,
  ResolveErrors,
  relativeComponents,
  relativeComponentsAuthored,
  ParseErrors,
  MissingLinks,
  MissingDists,
  MissingDependenciesOnFs,
  MissingCustomModuleResolutionLinks,
  ImportNonMainFiles,
  CustomModuleResolutionUsed,
};
type IssuesNames = keyof typeof IssuesClasses;

export class IssuesList {
  constructor(private issues: ComponentIssue[] = []) {}

  isEmpty() {
    return this.issues.length === 0;
  }

  toString() {
    return this.issues.map((issue) => issue.format()).join('');
  }

  add(issue: ComponentIssue) {
    this.issues.push(issue);
  }

  getIssue<T extends ComponentIssue>(issueType: { new (): T }): T | undefined {
    return this.issues.find((issue) => issue instanceof issueType) as T | undefined;
  }

  getIssueByName<T extends ComponentIssue>(issueType: IssuesNames): T | undefined {
    return this.issues.find((issue) => issue.constructor.name === issueType) as T | undefined;
  }

  getOrCreate<T extends ComponentIssue>(IssueClass: { new (): T }): T {
    return this.getIssue(IssueClass) || new IssueClass();
  }

  shouldBlockSavingInCache(): boolean {
    return this.issues.some((issue) => issue.isCacheBlocker);
  }

  shouldBlockTagging(): boolean {
    return this.issues.some((issue) => issue.isTagBlocker);
  }

  serialize() {}

  static deserialize(data: string) {}
}
