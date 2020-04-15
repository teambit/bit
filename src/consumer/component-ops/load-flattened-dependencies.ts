import R from 'ramda';
import Component from '../component/consumer-component';
import ComponentWithDependencies from '../../scope/component-dependencies';
import { Consumer } from '..';
import BitIds from '../../bit-id/bit-ids';
import BitId from '../../bit-id/bit-id';
import { COMPONENT_ORIGINS } from '../../constants';

export default (async function loadFlattenedDependenciesForCapsule(
  consumer: Consumer,
  component: Component
): Promise<ComponentWithDependencies> {
  const dependencies = await loadManyDependencies(component.dependencies.getAllIds());
  const devDependencies = await loadManyDependencies(component.devDependencies.getAllIds());
  const compilerDependencies = await loadManyDependencies(component.compilerDependencies.getAllIds());
  const testerDependencies = await loadManyDependencies(component.testerDependencies.getAllIds());
  const extensionDependencies = await loadManyDependencies(component.extensions.extensionsBitIds);

  await loadFlattened(dependencies);
  await loadFlattened(devDependencies);
  await loadFlattened(compilerDependencies);
  await loadFlattened(testerDependencies);

  return new ComponentWithDependencies({
    component,
    dependencies,
    devDependencies,
    compilerDependencies,
    testerDependencies,
    extensionDependencies
  });

  async function loadManyDependencies(dependenciesIds: BitId[]): Promise<Component[]> {
    return Promise.all(dependenciesIds.map(dep => loadDependency(dep)));
  }

  async function loadDependency(dependencyId: BitId): Promise<Component> {
    const componentMap = consumer.bitMap.getComponentIfExist(dependencyId);
    const couldBeModified = componentMap && componentMap.origin !== COMPONENT_ORIGINS.NESTED;
    if (couldBeModified) {
      return consumer.loadComponentForCapsule(dependencyId);
    }
    // for capsule, a dependency might have been installed as a package in the workspace, and as
    // such doesn't have a componentMap, which result in not stripping the sharedDir.
    // using the loadComponentWithDependenciesFromModel, all dependencies are loaded and their
    // shared dir is stripped. (see e2e-test of 'isolating with capsule' in dependencies-as-packages.e2e file)
    const componentWithDependenciesFromModel = await consumer.loadComponentWithDependenciesFromModel(
      dependencyId,
      false
    );
    return componentWithDependenciesFromModel.component.clone();
  }

  async function loadFlattened(deps: Component[]) {
    if (R.isEmpty(deps)) return;
    await loadFlattenedFromModel(deps);
    await loadFlattenedFromFsRecursively(deps);
  }

  async function loadFlattenedFromModel(deps: Component[]) {
    const dependenciesFromModel = deps.filter(d => !d.loadedFromFileSystem);
    const flattenedIdsFromModel = dependenciesFromModel.map(d => d.flattenedDependencies);
    const flattenedFromModel = await loadManyDependencies(R.flatten(flattenedIdsFromModel));
    deps.push(...flattenedFromModel);
  }

  async function loadFlattenedFromFsRecursively(components: Component[]) {
    const currentIds = BitIds.fromArray(components.map(c => c.id));
    const ids = R.flatten(components.filter(c => c.loadedFromFileSystem).map(c => c.dependencies.getAllIds()));
    const idsUniq = BitIds.uniqFromArray(ids);
    const newIds = idsUniq.filter(id => !currentIds.has(id));
    if (R.isEmpty(newIds)) return;
    const deps = await loadManyDependencies(newIds);
    if (R.isEmpty(deps)) return;
    components.push(...deps);
    await loadFlattened(components);
  }
});
