import mapSeries from 'p-map-series';
import { flatten } from 'lodash';
import { Consumer } from '@teambit/legacy/dist/consumer';
import BitIds from '@teambit/legacy/dist/bit-id/bit-ids';
import Component from '@teambit/legacy/dist/consumer/component/consumer-component';
import LegacyGraph from '@teambit/legacy/dist/scope/graph/graph';
import ScopeComponentsImporter from '@teambit/legacy/dist/scope/component-ops/scope-components-importer';
import compact from 'lodash.compact';
import { BitId } from '@teambit/legacy-bit-id';
import { Logger } from '@teambit/logger';
import { ComponentNotFound } from '@teambit/scope';
import { BitError } from '@teambit/bit-error';
import { Workspace } from './workspace';

export type ShouldIgnoreFunc = (bitId: BitId) => Promise<boolean>;

export class GraphFromFsBuilder {
  private graph = new LegacyGraph();
  private completed: string[] = [];
  private depth = 1;
  private shouldThrowOnMissingDep = true;
  private consumer: Consumer;
  constructor(
    private workspace: Workspace,
    private logger: Logger,
    private ignoreIds = new BitIds(),
    private shouldLoadItsDeps?: ShouldIgnoreFunc
  ) {
    this.consumer = this.workspace.consumer;
  }

  /**
   * create a graph with all dependencies and flattened dependencies of the given components.
   * the nodes are components and the edges has a label of the dependency type.
   *
   * the way how it is done is iterations by depths. each depth we gather all the dependencies of
   * that depths, make sure all objects exist and then check their dependencies for the next depth.
   * once there is no dependency left, we're on the last depth level and the graph is ready.
   *
   * for example, imagine the following graph:
   * A1 -> A2 -> A3
   * B1 -> B2 -> B3
   * C1 -> C2 -> C3
   *
   * where the buildGraph is given [A1, B1, C1].
   * first, it saves all these components as nodes in the graph. then, it finds the dependencies of
   * the next level, in this case they're [A2, B2, C2]. it runs `importMany` in case some objects
   * are missing. then, it loads them all (some from FS, some from the model) and sets the edges
   * between the component and the dependencies.
   * once done, it finds all their dependencies, which are [A3, B3, C3] and repeat the process
   * above. since there are no more dependencies, the graph is completed.
   * in this case, the total depth levels are 3.
   *
   * even with a huge project, there are not many depth levels. by iterating through depth levels
   * we keep performance sane as the importMany doesn't run multiple time and therefore the round
   * trips to the remotes are minimal.
   *
   * normally, one importMany of the seeders is enough as importMany knows to fetch all flattened.
   * however, since this buildGraph is performed on the workspace, a dependency may be new or
   * modified and as such, we don't know its flattened yet.
   */
  async buildGraph(ids: BitId[]): Promise<LegacyGraph> {
    this.logger.debug(`GraphFromFsBuilder, buildGraph with ${ids.length} seeders`);
    const start = Date.now();
    const components = await this.loadManyComponents(ids, '<none>');
    await this.processManyComponents(components);
    this.logger.debug(
      `GraphFromFsBuilder, buildGraph with ${ids.length} seeders completed (${(Date.now() - start) / 1000} sec)`
    );
    return this.graph;
  }

  private getAllDepsUnfiltered(component: Component) {
    return component.getAllDependenciesIds().difference(this.ignoreIds);
  }

  private async getAllDepsFiltered(component: Component): Promise<BitIds> {
    const depsWithoutIgnore = this.getAllDepsUnfiltered(component);
    const shouldLoadFunc = this.shouldLoadItsDeps;
    if (!shouldLoadFunc) return depsWithoutIgnore;
    const deps = await mapSeries(depsWithoutIgnore, async (depId) => {
      const shouldLoad = await shouldLoadFunc(depId);
      if (!shouldLoad) this.ignoreIds.push(depId);
      return shouldLoad ? depId : null;
    });
    return BitIds.fromArray(compact(deps));
  }

  private async processManyComponents(components: Component[]) {
    this.logger.debug(`GraphFromFsBuilder.processManyComponents depth ${this.depth}, ${components.length} components`);
    this.depth += 1;
    await this.importObjects(components);
    const allDependencies = await mapSeries(components, (component) => this.processOneComponent(component));
    const allDependenciesFlattened = flatten(allDependencies);
    if (allDependenciesFlattened.length) await this.processManyComponents(allDependenciesFlattened);
  }

  private async importObjects(components: Component[]) {
    const allDeps = components.map((c) => this.getAllDepsUnfiltered(c)).flat();
    const allDepsWithScope = allDeps.filter((dep) => dep.hasScope());
    const scopeComponentsImporter = new ScopeComponentsImporter(this.consumer.scope);
    await scopeComponentsImporter.importMany({
      ids: BitIds.uniqFromArray(allDepsWithScope),
      throwForDependencyNotFound: this.shouldThrowOnMissingDep,
    });
  }

  private async processOneComponent(component: Component) {
    const idStr = component.id.toString();
    if (this.completed.includes(idStr)) return [];
    const allIds = await this.getAllDepsFiltered(component);

    const allDependencies = await this.loadManyComponents(allIds, idStr);
    Object.entries(component.depsIdsGroupedByType).forEach(([depType, depsIds]) => {
      depsIds.forEach((depId) => {
        if (this.ignoreIds.has(depId)) return;
        if (!this.graph.hasNode(depId.toString())) {
          throw new Error(`buildOneComponent: missing node of ${depId.toString()}`);
        }
        this.graph.setEdge(idStr, depId.toString(), depType);
      });
    });
    this.completed.push(idStr);
    return allDependencies;
  }

  private async loadManyComponents(componentsIds: BitId[], dependenciesOf: string): Promise<Component[]> {
    const components = await mapSeries(componentsIds, async (comp: BitId) => {
      const idStr = comp.toString();
      const fromGraph = this.graph.node(idStr);
      if (fromGraph) return fromGraph;
      try {
        const component = await this.loadComponent(comp);
        this.graph.setNode(idStr, component);
        return component;
      } catch (err: any) {
        if (err instanceof ComponentNotFound) {
          throw new BitError(
            `error: component "${idStr}" was not found.\nthis component is a dependency of "${dependenciesOf}" and is needed as part of the graph generation`
          );
        }
        this.logger.error(`failed loading dependencies of ${dependenciesOf}`);
        throw err;
      }
    });
    return components;
  }
  private async loadComponent(componentId: BitId): Promise<Component> {
    const componentMap = this.consumer.bitMap.getComponentIfExist(componentId);
    const isOnWorkspace = Boolean(componentMap);
    if (isOnWorkspace) {
      return this.consumer.loadComponentForCapsule(componentId);
    }
    // a dependency might have been installed as a package in the workspace, and as such doesn't
    // have a componentMap.
    const componentFromModel = await this.consumer.loadComponentFromModel(componentId);
    return componentFromModel.clone();
  }
}
