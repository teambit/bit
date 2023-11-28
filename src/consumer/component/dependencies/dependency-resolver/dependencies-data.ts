import { IssuesList } from '@teambit/component-issues';
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
    public overridesDependencies?: OverridesDependenciesData
  ) {}

  serialize(): string {
    const { issues, allDependencies, ...rest } = this;
    return JSON.stringify({
      ...rest,
      issues: issues.serialize(),
      allDependencies: {
        dependencies: allDependencies.dependencies.map((dep) => dep.serialize()),
        devDependencies: allDependencies.devDependencies.map((dep) => dep.serialize()),
      },
    });
  }

  static deserialize(data: string): DependenciesData {
    const dataParsed = JSON.parse(data);
    const dependencies = dataParsed.allDependencies.dependencies.map((dep) => Dependency.deserialize(dep));
    const devDependencies = dataParsed.allDependencies.devDependencies.map((dep) => Dependency.deserialize(dep));
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
