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
export type IssuesNames = keyof typeof IssuesClasses;

export class IssuesList {
  constructor(private issues: ComponentIssue[] = []) {}

  get count() {
    return this.issues.length;
  }

  isEmpty() {
    return this.issues.length === 0;
  }

  toString() {
    return this.issues.map((issue) => issue.format()).join('');
  }

  toObject() {
    return this.issues.map((issue) => issue.toObject());
  }

  add(issue: ComponentIssue) {
    this.issues.push(issue);
  }

  delete(IssueClass: typeof ComponentIssue) {
    this.issues = this.issues.filter((issue) => !(issue instanceof IssueClass));
  }

  getIssue<T extends ComponentIssue>(IssueClass: { new (): T }): T | undefined {
    return this.issues.find((issue) => issue instanceof IssueClass) as T | undefined;
  }

  getIssueByName<T extends ComponentIssue>(issueType: IssuesNames): T | undefined {
    return this.issues.find((issue) => issue.constructor.name === issueType) as T | undefined;
  }

  createIssue<T extends ComponentIssue>(IssueClass: { new (): T }): T {
    const newIssue = new IssueClass();
    this.add(newIssue);
    return newIssue;
  }

  getOrCreate<T extends ComponentIssue>(IssueClass: { new (): T }): T {
    return this.getIssue(IssueClass) || this.createIssue(IssueClass);
  }

  shouldBlockSavingInCache(): boolean {
    return this.issues.some((issue) => issue.isCacheBlocker);
  }

  shouldBlockTagging(): boolean {
    return this.issues.some((issue) => issue.isTagBlocker);
  }

  serialize() {
    return this.issues.map((issue) => ({ type: issue.constructor.name, data: issue.serialize() }));
  }

  static deserialize(data: Record<string, any>) {
    if (!Array.isArray(data)) {
      // probably old format, ignore it and return an empty IssuesList
      return new IssuesList();
    }
    const issues = data.map((issue) => {
      const ClassName = issue.type;
      if (!Object.keys(IssuesClasses).includes(ClassName)) {
        throw new Error(`issue type "${ClassName}" is not recognized.
the following are permitted ${Object.keys(IssuesClasses).join(', ')}`);
      }
      const issueInstance: ComponentIssue = new IssuesClasses[ClassName]();
      issueInstance.data = issueInstance.deserialize(issue.data);
      return issueInstance;
    });
    return new IssuesList(issues);
  }
}
