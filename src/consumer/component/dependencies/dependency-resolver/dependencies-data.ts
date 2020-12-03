import { AllDependencies, AllPackagesDependencies, Issues } from './dependencies-resolver';
import { ManuallyChangedDependencies } from './overrides-dependencies';

type OverridesDependenciesData = {
  manuallyRemovedDependencies: ManuallyChangedDependencies;
  manuallyAddedDependencies: ManuallyChangedDependencies;
  missingPackageDependencies: string[];
};

export class DependenciesData {
  constructor(
    public allDependencies: AllDependencies,
    public allPackagesDependencies: AllPackagesDependencies,
    public issues: Issues,
    public coreAspects: string[],
    public overridesDependencies: OverridesDependenciesData
  ) {}
}
