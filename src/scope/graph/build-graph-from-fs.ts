import mapSeries from 'p-map-series';
import { flatten } from 'lodash';
import { Consumer } from '../../consumer';
import BitId from '../../bit-id/bit-id';
import BitIds from '../../bit-id/bit-ids';
import Component from '../../consumer/component/consumer-component';
import Graph from '../../scope/graph/graph';
import logger from '../../logger/logger';
import { ComponentNotFound } from '../exceptions';
import GeneralError from '../../error/general-error';
import ScopeComponentsImporter from '../component-ops/scope-components-importer';

export class GraphFromFsBuilder {
  private graph = new Graph();
  private completed: string[] = [];
  private depth = 1;
  private shouldThrowOnMissingDep = true;
  constructor(
    private consumer: Consumer,
    private ignoreIds = new BitIds(),
    private loadComponentsFunc?: (ids: BitId[]) => Promise<Component[]>
  ) {}

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
  async buildGraph(ids: BitId[]): Promise<Graph> {
    logger.debug(`GraphFromFsBuilder, buildGraph with ${ids.length} seeders`);
    const components = await this.loadManyComponents(ids, '<none>');
    await this.processManyComponents(components);
    return this.graph;
  }

  private getAllDeps(component: Component) {
    return component.getAllDependenciesIds().difference(this.ignoreIds);
  }

  private async processManyComponents(components: Component[]) {
    logger.debug(`GraphFromFsBuilder.processManyComponents depth ${this.depth}, ${components.length} components`);
    this.depth += 1;
    const allDeps = flatten(components.map((c) => this.getAllDeps(c)));
    const allDepsWithScope = allDeps.filter((dep) => dep.hasScope());
    const scopeComponentsImporter = new ScopeComponentsImporter(this.consumer.scope);
    await scopeComponentsImporter.importMany(
      BitIds.uniqFromArray(allDepsWithScope),
      undefined,
      this.shouldThrowOnMissingDep
    );
    const allDependencies = await mapSeries(components, (component) => this.processOneComponent(component));
    const allDependenciesFlattened = flatten(allDependencies);
    if (allDependenciesFlattened.length) await this.processManyComponents(allDependenciesFlattened);
  }

  private async processOneComponent(component: Component) {
    const idStr = component.id.toString();
    if (this.completed.includes(idStr)) return [];
    const allIds = this.getAllDeps(component);

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
    return mapSeries(componentsIds, async (comp: BitId) => {
      const idStr = comp.toString();
      const fromGraph = this.graph.node(idStr);
      if (fromGraph) return fromGraph;
      try {
        const component = await this.loadComponent(comp);
        this.graph.setNode(idStr, component);
        return component;
      } catch (err) {
        if (err instanceof ComponentNotFound) {
          throw new GeneralError(
            `error: component "${idStr}" was not found.\nthis component is a dependency of "${dependenciesOf}" and is needed as part of the graph generation`
          );
        }
        logger.error(`failed loading dependencies of ${dependenciesOf}`);
        throw err;
      }
    });
  }
  private async loadComponent(componentId: BitId): Promise<Component> {
    const componentMap = this.consumer.bitMap.getComponentIfExist(componentId);
    const isOnWorkspace = Boolean(componentMap);
    if (isOnWorkspace) {
      if (this.loadComponentsFunc) {
        const dependency = await this.loadComponentsFunc([componentId]);
        if (!dependency.length || !dependency[0]) {
          throw new Error(`unable to load ${componentId.toString()} using custom load function`);
        }
        return dependency[0];
      }
      return this.consumer.loadComponentForCapsule(componentId);
    }
    // a dependency might have been installed as a package in the workspace, and as such doesn't
    // have a componentMap.
    const componentFromModel = await this.consumer.loadComponentFromModel(componentId);
    return componentFromModel.clone();
  }
}
