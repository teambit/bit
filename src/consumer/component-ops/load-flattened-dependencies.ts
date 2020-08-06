import R from 'ramda';
import pMapSeries from 'p-map-series';
import Component from '../component/consumer-component';
import ComponentWithDependencies from '../../scope/component-dependencies';
import { Consumer } from '..';
import BitIds from '../../bit-id/bit-ids';
import BitId from '../../bit-id/bit-id';
import { COMPONENT_ORIGINS } from '../../constants';

export class FlattenedDependencyLoader {
  private cache: { [bitIdStr: string]: Component } = {};
  constructor(private consumer: Consumer) {}
  async load(component: Component) {
    const dependencies = await this.loadManyDependencies(component.dependencies.getAllIds());
    const devDependencies = await this.loadManyDependencies(component.devDependencies.getAllIds());
    const extensionDependencies = await this.loadManyDependencies(component.extensions.extensionsBitIds);
    await this.loadFlattened(dependencies);
    await this.loadFlattened(devDependencies);
    await this.loadFlattened(extensionDependencies);

    return new ComponentWithDependencies({
      component,
      dependencies,
      devDependencies,
      extensionDependencies,
    });
  }
  async loadManyDependencies(dependenciesIds: BitId[]): Promise<Component[]> {
    return pMapSeries(dependenciesIds, (dep: BitId) => this.loadDependency(dep));
  }

  async loadDependency(dependencyId: BitId): Promise<Component> {
    if (!this.cache[dependencyId.toString()]) {
      const componentMap = this.consumer.bitMap.getComponentIfExist(dependencyId);
      const couldBeModified = componentMap && componentMap.origin !== COMPONENT_ORIGINS.NESTED;
      if (couldBeModified) {
        return this.consumer.loadComponentForCapsule(dependencyId);
      }
      // for capsule, a dependency might have been installed as a package in the workspace, and as
      // such doesn't have a componentMap, which result in not stripping the sharedDir.
      // using the loadComponentWithDependenciesFromModel, all dependencies are loaded and their
      // shared dir is stripped. (see e2e-test of 'isolating with capsule' in dependencies-as-packages.e2e file)
      const componentWithDependenciesFromModel = await this.consumer.loadComponentWithDependenciesFromModel(
        dependencyId,
        false
      );
      this.cache[dependencyId.toString()] = componentWithDependenciesFromModel.component.clone();
    }
    return this.cache[dependencyId.toString()];
  }

  async loadFlattened(deps: Component[]) {
    if (R.isEmpty(deps)) return;
    await this.loadFlattenedFromModel(deps);
    await this.loadFlattenedFromFsRecursively(deps);
  }

  async loadFlattenedFromModel(deps: Component[]) {
    const dependenciesFromModel = deps.filter((d) => !d.loadedFromFileSystem);
    const flattenedIdsFromModel = dependenciesFromModel.map((d) => d.flattenedDependencies);
    const flattenedFromModel = await this.loadManyDependencies(R.flatten(flattenedIdsFromModel));
    deps.push(...flattenedFromModel);
  }

  async loadFlattenedFromFsRecursively(components: Component[]) {
    const currentIds = BitIds.fromArray(components.map((c) => c.id));
    const ids = R.flatten(components.filter((c) => c.loadedFromFileSystem).map((c) => c.getAllDependenciesIds()));
    const idsUniq = BitIds.uniqFromArray(ids);
    const newIds = idsUniq.filter((id) => !currentIds.has(id));
    if (R.isEmpty(newIds)) return;
    const deps = await this.loadManyDependencies(newIds);
    if (R.isEmpty(deps)) return;
    components.push(...deps);
    await this.loadFlattened(components);
  }
}
