import { IssuesList } from '@teambit/component-issues';
import { BitId } from '../../../../bit-id';
import Dependency from '../dependency';
import { AllDependencies, AllPackagesDependencies } from './dependencies-resolver';
import { ManuallyChangedDependencies } from './overrides-dependencies';

export type OverridesDependenciesData = {
  manuallyRemovedDependencies: ManuallyChangedDependencies;
  manuallyAddedDependencies: ManuallyChangedDependencies;
  missingPackageDependencies: string[];
};

export class DependenciesData {
  constructor(
    public allDependencies: AllDependencies,
    public allPackagesDependencies: AllPackagesDependencies,
    public issues: IssuesList,
    public coreAspects: string[],
    public overridesDependencies: OverridesDependenciesData
  ) {}

  serialize(): string {
    const { issues, ...nonIssues } = this;
    return JSON.stringify({ ...nonIssues, issues: issues.serialize() });
  }

  static deserialize(data: string): DependenciesData {
    const dataParsed = JSON.parse(data);
    const dependencies = dataParsed.allDependencies.dependencies.map(
      (dep) => new Dependency(new BitId(dep.id), dep.relativePaths, dep.packageName)
    );
    const devDependencies = dataParsed.allDependencies.devDependencies.map(
      (dep) => new Dependency(new BitId(dep.id), dep.relativePaths, dep.packageName)
    );
    const issuesList = IssuesList.deserialize(dataParsed.issues);
    const allDependencies = { dependencies, devDependencies };
    return new DependenciesData(
      allDependencies,
      dataParsed.allPackagesDependencies,
      issuesList,
      dataParsed.coreAspects,
      dataParsed.overridesDependencies
    );
  }
}
