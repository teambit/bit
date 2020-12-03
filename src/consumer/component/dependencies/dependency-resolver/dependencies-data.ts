import { AllDependencies, AllPackagesDependencies, Issues } from './dependencies-resolver';
import OverridesDependencies from './overrides-dependencies';

export class DependenciesData {
  constructor(
    public allDependencies: AllDependencies,
    public allPackagesDependencies: AllPackagesDependencies,
    public issues: Issues,
    public coreAspects: string[],
    public overridesDependencies: OverridesDependencies
  ) {}
}
