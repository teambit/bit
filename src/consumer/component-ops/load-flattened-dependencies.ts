import mapSeries from 'p-map-series';
import R from 'ramda';

import { Consumer } from '..';
import BitId from '../../bit-id/bit-id';
import BitIds from '../../bit-id/bit-ids';
import { COMPONENT_ORIGINS } from '../../constants';
import ComponentWithDependencies from '../../scope/component-dependencies';
import Component from '../component/consumer-component';
import Graph from '../../scope/graph/graph';
import logger from '../../logger/logger';

export class FlattenedDependencyLoader {
  private cache: { [bitIdStr: string]: Component } = {};
  private graph = new Graph();
  private completed: string[] = [];
  constructor(
    private consumer: Consumer,
    private ignoreIds = new BitIds(),
    private loadComponentsFunc?: (ids: BitId[]) => Promise<Component[]>
  ) {}
  async buildGraph(components: Component[]): Promise<Graph> {
    components.forEach((c) => {
      this.graph.setNode(c.id.toString(), c);
    });
    await mapSeries(components, (component) => this.buildOneComponent(component));
    return this.graph;
  }

  async buildOneComponent(component: Component) {
    const compId = component.id;
    if (this.completed.includes(compId.toString())) return;
    const dependencies = await this.loadManyComponents(
      component.dependencies.getAllIds().difference(this.ignoreIds),
      compId
    );
    const devDependencies = await this.loadManyComponents(
      component.devDependencies.getAllIds().difference(this.ignoreIds),
      compId
    );
    const extensionDependencies = await this.loadManyComponents(
      component.extensions.extensionsBitIds.difference(this.ignoreIds),
      compId
    );
    Object.entries(component.depsIdsGroupedByType).forEach(([depType, depIds]) => {
      depIds.forEach((depId) => {
        if (this.ignoreIds.has(depId)) return;
        if (!this.graph.hasNode(depId.toString())) {
          throw new Error(`buildOneComponent: missing node of ${depId.toString()}`);
        }
        this.graph.setEdge(compId.toString(), depId.toString(), depType);
      });
    });
    this.completed.push(compId.toString());
    const allComps = [...dependencies, ...devDependencies, ...extensionDependencies];
    await mapSeries(allComps, (comp) => this.buildOneComponent(comp));
  }

  async load(component: Component) {
    const dependencies = await this.loadManyDependencies(component.dependencies.getAllIds().difference(this.ignoreIds));
    const devDependencies = await this.loadManyDependencies(
      component.devDependencies.getAllIds().difference(this.ignoreIds)
    );
    const extensionDependencies = await this.loadManyDependencies(
      component.extensions.extensionsBitIds.difference(this.ignoreIds)
    );

    const filterIgnoreIds = (comps: any[]) => {
      if (!this.ignoreIds.length) {
        // workaround for old @teambit/cli. for some reason, comps sometimes have null/undefined
        // and as a result, even comps.filter(x => x) causes of errors later on.
        return comps;
      }
      return comps.filter((dep) => !this.ignoreIds.has(dep.id));
    };

    const filteredDeps = filterIgnoreIds(dependencies);
    const filteredDevDeps = filterIgnoreIds(devDependencies);
    const filteredExtDeps = filterIgnoreIds(extensionDependencies);
    await this.loadFlattenedRecursively(filteredDeps);
    await this.loadFlattenedRecursively(filteredDevDeps);
    await this.loadFlattenedRecursively(filteredExtDeps);

    return new ComponentWithDependencies({
      component,
      dependencies: filteredDeps,
      devDependencies: filteredDevDeps,
      extensionDependencies: filteredExtDeps,
    });
  }
  async loadManyComponents(componentsIds: BitId[], dependenciesOf: BitId): Promise<Component[]> {
    // const nonIgnored = componentsIds.filter(id => !this.ignoreIds.has(id)); // @todo: maybe should be done on the first level only
    return mapSeries(componentsIds, async (comp: BitId) => {
      const idStr = comp.toString();
      const fromGraph = this.graph.node(idStr);
      if (fromGraph) return fromGraph;
      try {
        return await this.loadComponent(comp);
      } catch (err) {
        logger.error(`failed loading dependencies of ${dependenciesOf.toString()}`);
        throw err;
      }
    });
  }
  async loadComponent(componentId: BitId): Promise<Component> {
    const idStr = componentId.toString();
    const fromGraph = this.graph.node(idStr);
    if (fromGraph) return fromGraph;
    const componentMap = this.consumer.bitMap.getComponentIfExist(componentId);
    const couldBeModified = componentMap && componentMap.origin !== COMPONENT_ORIGINS.NESTED;
    if (couldBeModified) {
      if (this.loadComponentsFunc) {
        const dependency = await this.loadComponentsFunc([componentId]);
        if (!dependency.length || !dependency[0]) {
          throw new Error(`unable to load ${componentId.toString()} using custom load function`);
        }
        this.graph.setNode(idStr, dependency[0]);
      } else {
        this.graph.setNode(idStr, await this.consumer.loadComponentForCapsule(componentId));
      }
      return this.graph.node(idStr);
    }
    // for capsule, a dependency might have been installed as a package in the workspace, and as
    // such doesn't have a componentMap.
    const componentFromModel = await this.consumer.loadComponentFromModel(componentId);
    this.graph.setNode(idStr, componentFromModel.clone());
    this.cache[componentId.toString()] = componentFromModel.clone();

    return this.cache[componentId.toString()];
  }

  async loadManyDependencies(dependenciesIds: BitId[]): Promise<Component[]> {
    return mapSeries(dependenciesIds, (dep: BitId) => this.loadDependency(dep));
  }

  async loadDependency(dependencyId: BitId): Promise<Component> {
    if (!this.cache[dependencyId.toString()]) {
      const componentMap = this.consumer.bitMap.getComponentIfExist(dependencyId);
      const couldBeModified = componentMap && componentMap.origin !== COMPONENT_ORIGINS.NESTED;
      if (couldBeModified) {
        if (this.loadComponentsFunc) {
          const dependency = await this.loadComponentsFunc([dependencyId]);
          if (!dependency.length || !dependency[0])
            throw new Error(`unable to load ${dependencyId.toString()} using custom load function`);
          this.cache[dependencyId.toString()] = dependency[0];
        } else {
          this.cache[dependencyId.toString()] = await this.consumer.loadComponentForCapsule(dependencyId);
        }

        return this.cache[dependencyId.toString()];
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

  async loadFlattenedRecursively(deps: Component[], visited: string[] = []): Promise<Component[]> {
    if (R.isEmpty(deps)) return [];
    const notVisitedDeps = deps.filter((dep) => !visited.includes(dep.id.toString()));
    const flattenedFromModel = await this.loadFlattenedFromModel(notVisitedDeps);
    deps.push(...flattenedFromModel);
    const flattenedFromFs = await this.loadFlattenedFromFs(notVisitedDeps);
    const newVisitedIds = deps.map((dep) => dep.id.toString());
    deps.push(...flattenedFromFs);
    if (flattenedFromFs.length) {
      const newVisited = R.uniq(visited.concat(newVisitedIds));
      await this.loadFlattenedRecursively(deps, newVisited);
      return deps;
    }
    return deps;
  }

  async loadFlattenedFromModel(deps: Component[]): Promise<Component[]> {
    const dependenciesFromModel = deps.filter((d) => !d.loadedFromFileSystem);
    const flattenedIdsFromModel = dependenciesFromModel.map((d) => d.getAllFlattenedDependencies());
    const flattenedFromModel = await this.loadManyDependencies(R.flatten(flattenedIdsFromModel));
    return flattenedFromModel;
  }

  // @todo: in case of out-of-sync, when a component has versions in the objects but the .bitmap
  // has the component without any version, this function result in "Maximum call stack size
  // exceeded" error.
  async loadFlattenedFromFs(components: Component[]): Promise<Component[]> {
    const currentIds = BitIds.fromArray(components.map((c) => c.id));
    const ids = R.flatten(components.filter((c) => c.loadedFromFileSystem).map((c) => c.getAllDependenciesIds()));
    const idsUniq = BitIds.uniqFromArray(ids);
    const newIds = idsUniq.filter((id) => !currentIds.has(id));
    if (R.isEmpty(newIds)) return [];
    const deps = await this.loadManyDependencies(newIds);
    if (R.isEmpty(deps)) return [];
    return deps;
  }
}
