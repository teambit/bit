import { ComponentIssue, IssueObject } from './component-issue';
import { ImportNonMainFiles } from './import-non-main-files';
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
import { NonLoadedEnv } from './non-loaded-env';
import { ExternalEnvWithoutVersion } from './external-env-without-version';
import { RemovedDependencies } from './removed-dependencies';
import { SelfReference } from './self-reference';
import { ImportFromDirectory } from './import-from-directory';
import { DeprecatedDependencies } from './deprecated-dependencies';
import { RemovedEnv } from './removed-env';

export const IssuesClasses = {
  MissingPackagesDependenciesOnFs,
  MissingManuallyConfiguredPackages,
  UntrackedDependencies,
  ResolveErrors,
  RelativeComponents,
  RelativeComponentsAuthored,
  ParseErrors,
  MissingDists,
  LegacyInsideHarmony,
  MissingDependenciesOnFs,
  ImportNonMainFiles,
  MultipleEnvs,
  MissingLinksFromNodeModulesToSrc,
  CircularDependencies,
  DuplicateComponentAndPackage,
  MergeConfigHasConflict,
  NonLoadedEnv,
  ExternalEnvWithoutVersion,
  RemovedDependencies,
  RemovedEnv,
  DeprecatedDependencies,
  SelfReference,
  ImportFromDirectory,
};
export type IssuesNames = keyof typeof IssuesClasses;

export class IssuesList {
  constructor(
    /**
     * only reason to have "issues" as public is to avoid the error "Types have separate declarations of a private property"
     * because it is used in the legacy as well. it's possible to remove it from bit-repo and install as a package, but it's not
     * convenient for now.
     */
    public _issues: ComponentIssue[] = []
  ) {}

  get count() {
    return this._issues.length;
  }

  isEmpty() {
    return this._issues.length === 0;
  }

  outputForCLI() {
    return this._issues.map((issue) => issue.outputForCLI()).join('');
  }

  toObject(): { type: string; description: string; data: any }[] {
    return this._issues.map((issue) => issue.toObject());
  }

  /**
   * @deprecated use toObjectIncludeDataAsString instead
   * this method changes the "data" prop to string, which can be unexpected, and at times both are needed, the raw and the string.
   * if you change to use `toObjectIncludeDataAsString`, make sure to call "dataAsString" instead of "data" when needed.
   */
  toObjectWithDataAsString(): { type: string; description: string; data: string }[] {
    return this._issues.map((issue) => ({
      ...issue.toObject(),
      data: issue.dataToString().trim(),
    }));
  }

  add(issue: ComponentIssue) {
    this._issues.push(issue);
  }

  delete(IssueClass: typeof ComponentIssue) {
    this._issues = this._issues.filter((issue) => issue.constructor.name !== IssueClass.name);
  }

  hasTagBlockerIssues(): boolean {
    return this._issues.some((issue) => issue.isTagBlocker);
  }

  getIssue<T extends ComponentIssue>(IssueClass: { new (): T }): T | undefined {
    // don't use instanceof, e.g. `this._issues.find((issue) => issue instanceof IssueClass)`
    // the "component-issues" package can come from different sources, so the "instanceof" won't work.
    // use only getIssueByName for this.
    return this.getIssueByName(IssueClass.name as IssuesNames);
  }

  getIssueByName<T extends ComponentIssue>(issueType: IssuesNames): T | undefined {
    return this._issues.find((issue) => issue.constructor.name === issueType) as T | undefined;
  }

  getAllIssues(): ComponentIssue[] {
    return this._issues;
  }

  getAllIssueNames(): string[] {
    return this._issues.map((issue) => issue.constructor.name);
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
    return this._issues.some((issue) => issue.isCacheBlocker);
  }

  shouldBlockTagging(): boolean {
    return this._issues.some((issue) => issue.isTagBlocker);
  }

  filterNonTagBlocking(): IssuesList {
    return new IssuesList(this._issues.filter((issue) => issue.isTagBlocker));
  }

  toObjectIncludeDataAsString(): Array<IssueObject & { dataAsString: string }> {
    return this._issues.map((issue) => ({
      ...issue.toObject(),
      dataAsString: issue.dataToString(),
    }));
  }

  serialize() {
    return this._issues.map((issue) => ({ type: issue.constructor.name, data: issue.serialize() }));
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
