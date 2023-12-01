import { IssuesList } from '@teambit/component-issues';
import { Dependency } from '@teambit/legacy/dist/consumer/component/dependencies';
import { ManuallyChangedDependencies } from '@teambit/legacy/dist/consumer/component/consumer-component';
import { AllDependencies, AllPackagesDependencies } from './apply-overrides';

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
    public coreAspects: string[]
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
      // for backward compatibility. version < 1.5.1 expected this to be saved in the fs cache.
      overridesDependencies: {
        manuallyRemovedDependencies: {},
        manuallyAddedDependencies: {},
        missingPackageDependencies: [],
      },
    });
  }

  static deserialize(data: string): DependenciesData {
    const dataParsed = JSON.parse(data);
    const dependencies = dataParsed.allDependencies.dependencies.map((dep) => Dependency.deserialize(dep));
    const devDependencies = dataParsed.allDependencies.devDependencies.map((dep) => Dependency.deserialize(dep));
    const issuesList = IssuesList.deserialize(dataParsed.issues);
    const allDependencies = { dependencies, devDependencies };
    const coreAspects = dataParsed.coreAspects;
    return new DependenciesData(allDependencies, dataParsed.allPackagesDependencies, issuesList, coreAspects);
  }
}
