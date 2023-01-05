import { ComponentIssue } from './component-issue';
import { CustomModuleResolutionUsed } from './custom-module-resolution-used';
import { ImportNonMainFiles } from './import-non-main-files';
import { MissingComponents } from './missing-components';
import { MissingDependenciesOnFs } from './missing-dependencies-on-fs';
import { MissingDists } from './missing-dists';
import { MissingPackagesDependenciesOnFs } from './missing-packages-dependencies-on-fs';
import { MissingManuallyConfiguredPackages } from './missing-manually-configured-packages';
import { ParseErrors } from './parse-errors';
import { RelativeComponents } from './relative-components';
import { RelativeComponentsAuthored } from './relative-components-authored';
import { ResolveErrors } from './resolve-errors';
import { UntrackedDependencies } from './untracked-dependencies';
import { LegacyInsideHarmony } from './legacy-inside-harmony';
import { MultipleEnvs } from './multiple-envs';
import { MissingLinksFromNodeModulesToSrc } from './missing-links-from-nm-to-src';
import { CircularDependencies } from './circular-dependencies';
import { DuplicateComponentAndPackage } from './duplicate-component-and-package';
import { MergeConfigHasConflict } from './merge-config-has-conflict';

export const IssuesClasses = {
  MissingPackagesDependenciesOnFs,
  MissingManuallyConfiguredPackages,
  MissingComponents,
  UntrackedDependencies,
  ResolveErrors,
  RelativeComponents,
  RelativeComponentsAuthored,
  ParseErrors,
  MissingDists,
  LegacyInsideHarmony,
  MissingDependenciesOnFs,
  ImportNonMainFiles,
  CustomModuleResolutionUsed,
  MultipleEnvs,
  MissingLinksFromNodeModulesToSrc,
  CircularDependencies,
  DuplicateComponentAndPackage,
  MergeConfigHasConflict,
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

  outputForCLI() {
    return this.issues.map((issue) => issue.outputForCLI()).join('');
  }

  toObject(): { type: string; description: string; data: any }[] {
    return this.issues.map((issue) => issue.toObject());
  }

  toObjectWithDataAsString(): { type: string; description: string; data: string }[] {
    return this.issues.map((issue) => ({
      ...issue.toObject(),
      data: issue.dataToString().trim(),
    }));
  }

  add(issue: ComponentIssue) {
    this.issues.push(issue);
  }

  delete(IssueClass: typeof ComponentIssue) {
    this.issues = this.issues.filter((issue) => issue.constructor.name !== IssueClass.name);
  }

  getIssue<T extends ComponentIssue>(IssueClass: { new (): T }): T | undefined {
    return this.issues.find((issue) => issue instanceof IssueClass) as T | undefined;
  }

  getIssueByName<T extends ComponentIssue>(issueType: IssuesNames): T | undefined {
    return this.issues.find((issue) => issue.constructor.name === issueType) as T | undefined;
  }

  getAllIssues(): ComponentIssue[] {
    return this.issues;
  }

  getAllIssueNames(): string[] {
    return this.issues.map((issue) => issue.constructor.name);
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

  filterNonTagBlocking(): IssuesList {
    return new IssuesList(this.issues.filter((issue) => issue.isTagBlocker));
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
