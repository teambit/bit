import mapSeries from 'p-map-series';
import { get, flatten } from 'lodash';
import LegacyComponent from '@teambit/legacy/dist/consumer/component';
import { IssuesClasses } from '@teambit/component-issues';
import { DependencyFactory } from './dependency-factory';
import { SerializedDependency } from './dependency';
import { DependencyList } from './dependency-list';
import { UnknownDepType } from './exceptions';
import { DependencyResolverAspect } from '../dependency-resolver.aspect';

export class DependencyListFactory {
  constructor(private factories: Record<string, DependencyFactory>) {}

  async fromSerializedDependencies(serializedDependencies: SerializedDependency[]): Promise<DependencyList> {
    const dependencies = await mapSeries(serializedDependencies, async (serializedDependency) => {
      const type = serializedDependency.__type;
      const factory = this.factories[type];
      if (!factory) {
        throw new UnknownDepType(type);
      }
      const dependency = await factory.parse(serializedDependency);
      return dependency;
    });
    return new DependencyList(dependencies);
  }

  async fromLegacyComponent(legacyComponent: LegacyComponent): Promise<DependencyList> {
    const lists = await mapSeries(Object.values(this.factories), async (factory) => {
      if (factory.fromLegacyComponent && typeof factory.fromLegacyComponent === 'function') {
        return factory.fromLegacyComponent(legacyComponent);
      }
      return new DependencyList([]);
    });

    // This is an important step, see comment for the function to better understand
    const missingDepsFromModel = await this.getMissingDependenciesByComponentFromModel(legacyComponent);
    lists.push(missingDepsFromModel);
    return DependencyList.merge(lists);
  }

  /**
   * Some time after importing component (for example), there are required dependencies which are not installed yet, they will consider as missing.
   * since the installer it self used the calculated deps for installing we need them to be listed as well.
   * what we do here, is to add deps from the model in case they considered as missing deps in the fs
   * we don't want just to add all of them since some of them might be removed by the user in the fs (in the source code).
   * by intersect the missing deps (deps which are still required in source code) with the deps from model we have a list of deps with all the required
   * data of them
   * @param legacyComponent
   */
  private async getMissingDependenciesByComponentFromModel(legacyComponent: LegacyComponent): Promise<DependencyList> {
    const missingPackages: string[] = flatten(
      Object.values(legacyComponent.issues?.getIssue(IssuesClasses.MissingPackagesDependenciesOnFs)?.data || {})
    );
    const componentFromModel = legacyComponent.componentFromModel;
    if (!missingPackages || !missingPackages.length || !componentFromModel) {
      return DependencyList.fromArray([]);
    }
    // All deps defined in model
    const depListFromModel = await this.getDependenciesFromLegacyModelComponent(componentFromModel);
    // Only deps from model which are also required in the current component on fs (currently missing)
    const filteredDepList = depListFromModel.filter((dep) => {
      const packageName = dep.getPackageName?.();
      if (!packageName) {
        return false;
      }
      return missingPackages.includes(packageName);
    });
    return filteredDepList;
  }

  /**
   * Get dependencies based on the component from model attached to the legacy (consumer component)
   * @param legacyComponent
   */
  private async getDependenciesFromLegacyModelComponent(legacyComponent: LegacyComponent): Promise<DependencyList> {
    const entry = legacyComponent.extensions.findCoreExtension(DependencyResolverAspect.id);
    if (!entry) {
      return DependencyList.fromArray([]);
    }
    const serializedDependencies: SerializedDependency[] = get(entry, ['data', 'dependencies'], []);
    return this.fromSerializedDependencies(serializedDependencies);
  }
}
