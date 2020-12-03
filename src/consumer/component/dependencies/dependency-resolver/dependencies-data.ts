import { BitId } from '../../../../bit-id';
import Dependency from '../dependency';
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

  serialize(): string {
    return JSON.stringify(this);
  }

  static deserialize(data: string): DependenciesData {
    const dataParsed = JSON.parse(data);
    const dependencies = dataParsed.allDependencies.dependencies.map(
      (dep) => new Dependency(new BitId(dep.id), dep.relativePaths, dep.packageName)
    );
    const devDependencies = dataParsed.allDependencies.devDependencies.map(
      (dep) => new Dependency(new BitId(dep.id), dep.relativePaths, dep.packageName)
    );
    const relativeComponentsAuthored = dataParsed.issues?.relativeComponentsAuthored;
    if (relativeComponentsAuthored) {
      Object.keys(relativeComponentsAuthored).forEach((fileName) => {
        relativeComponentsAuthored[fileName] = relativeComponentsAuthored[fileName].map((record) => ({
          importSource: record.importSource,
          componentId: new BitId(record.componentId),
          relativePath: record.relativePath,
        }));
      });
    }
    const issues = { ...(dataParsed.issues || {}), relativeComponentsAuthored };

    const allDependencies = { dependencies, devDependencies };
    return new DependenciesData(
      allDependencies,
      dataParsed.allPackagesDependencies,
      issues,
      dataParsed.coreAspects,
      dataParsed.overridesDependencies
    );
  }
}
