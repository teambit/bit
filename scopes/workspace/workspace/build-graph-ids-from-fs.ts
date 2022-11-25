import mapSeries from 'p-map-series';
import { Graph, Node, Edge } from '@teambit/graph.cleargraph';
import { flatten } from 'lodash';
import { Consumer } from '@teambit/legacy/dist/consumer';
import { BitId } from '@teambit/legacy-bit-id';
import { Component, ComponentID } from '@teambit/component';
import BitIds from '@teambit/legacy/dist/bit-id/bit-ids';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component/consumer-component';
import { DepEdgeType } from '@teambit/graph';
import { ComponentNotFound, ScopeNotFound } from '@teambit/legacy/dist/scope/exceptions';
import { ComponentNotFound as ComponentNotFoundInScope } from '@teambit/scope';
import compact from 'lodash.compact';
import { Logger } from '@teambit/logger';
import { BitError } from '@teambit/bit-error';
import { Workspace } from './workspace';

export class GraphIdsFromFsBuilder {
  private graph = new Graph<ComponentID, DepEdgeType>();
  private completed: string[] = [];
  private depth = 1;
  private consumer: Consumer;
  private legacyIdStrToComponentId: { [bitIdStr: string]: ComponentID } = {};
  private loadedComponents: { [idStr: string]: Component } = {};
  private importedIds: string[] = [];
  constructor(private workspace: Workspace, private logger: Logger, private shouldThrowOnMissingDep = true) {
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
  async buildGraph(ids: ComponentID[]): Promise<Graph<ComponentID, DepEdgeType>> {
    this.logger.debug(`GraphIdsFromFsBuilder, buildGraph with ${ids.length} seeders`);
    const start = Date.now();
    const components = await this.loadManyComponents(ids);
    await this.processManyComponents(components);
    this.logger.debug(
      `GraphFromFsBuilder, buildGraph with ${ids.length} seeders completed (${(Date.now() - start) / 1000} sec)`
    );
    return this.graph;
  }

  private async getAllDeps(component: Component): Promise<ComponentID[]> {
    const consumerComp = component.state._consumer as ConsumerComponent;
    const legacyDepsIds = consumerComp.getAllDependenciesIds();
    const depsIds = await Promise.all(
      legacyDepsIds.map(async (bitId) => {
        if (!this.legacyIdStrToComponentId[bitId.toString()]) {
          this.legacyIdStrToComponentId[bitId.toString()] = await this.workspace.resolveComponentId(bitId);
        }
        return this.legacyIdStrToComponentId[bitId.toString()];
      })
    );
    return depsIds;
  }

  private async processManyComponents(components: Component[]) {
    this.logger.debug(`GraphFromFsBuilder.processManyComponents depth ${this.depth}, ${components.length} components`);
    this.depth += 1;
    await this.importObjects(components);
    const allDependencies = await mapSeries(components, (component) => this.processOneComponent(component));
    const allDependenciesFlattened = flatten(allDependencies);
    if (allDependenciesFlattened.length) await this.processManyComponents(allDependenciesFlattened);
  }

  /**
   * only for components from the workspace that can be modified to add/remove dependencies, we need to make sure that
   * all their dependencies are imported.
   * remember that `importMany` fetches all flattened dependencies. once a component from scope is imported, we know
   * that all its flattened dependencies are there. no need to call importMany again for them.
   */
  private async importObjects(components: Component[]) {
    const workspaceIds = await this.workspace.listIds();
    const compOnWorkspaceOnly = components.filter((comp) => workspaceIds.find((id) => id.isEqual(comp.id)));
    const allDeps = (await Promise.all(compOnWorkspaceOnly.map((c) => this.getAllDeps(c)))).flat();
    const allDepsNotImported = allDeps.filter((d) => !this.importedIds.includes(d.toString()));
    const allDepsWithScope = allDepsNotImported.map((id) => id._legacy).filter((dep) => dep.hasScope());
    const scopeComponentsImporter = this.consumer.scope.scopeImporter;
    await scopeComponentsImporter.importMany({
      ids: BitIds.uniqFromArray(allDepsWithScope),
      throwForDependencyNotFound: this.shouldThrowOnMissingDep,
      throwForSeederNotFound: this.shouldThrowOnMissingDep,
      reFetchUnBuiltVersion: false,
      preferDependencyGraph: true,
    });
    allDepsNotImported.map((id) => this.importedIds.push(id.toString()));
  }

  private async processOneComponent(component: Component) {
    const idStr = component.id.toString();
    if (this.completed.includes(idStr)) return [];
    const consumerComponent = component.state._consumer as ConsumerComponent;
    if (consumerComponent.flattenedEdges.length && !(await this.workspace.hasId(component.id))) {
      const getCompId = (bitId: BitId) => {
        if (!bitId.hasScope())
          throw new Error(
            `component ${idStr} is from scope, not workspace, but its dep ${bitId.toString()} has no scope`
          );
        return ComponentID.fromLegacy(bitId);
      };
      consumerComponent.flattenedEdges.forEach((flattenEdge) => {
        const source = getCompId(flattenEdge.source);
        const target = getCompId(flattenEdge.target);
        this.graph.setNode(new Node(source.toString(), source));
        this.graph.setNode(new Node(target.toString(), target));
        this.graph.setEdge(new Edge(source.toString(), target.toString(), flattenEdge.type));
      });
      this.completed.push(idStr);
      return [];
    }

    const allIds = await this.getAllDeps(component);

    const allDependencies = await this.loadManyComponents(allIds, idStr);
    Object.entries(consumerComponent.depsIdsGroupedByType).forEach(([depType, depsIds]) => {
      const getType = (): DepEdgeType => {
        switch (depType) {
          case 'devDependencies':
            return 'dev';
          case 'dependencies':
            return 'prod';
          case 'extensionDependencies':
            return 'ext';
          default:
            throw new Error(`depType ${depType} is not recognized`);
        }
      };
      depsIds.forEach((depBitId) => {
        const depId = this.legacyIdStrToComponentId[depBitId.toString()];
        if (!depId) throw new Error(`unable to find ${depBitId.toString()} inside legacyIdStrToComponentId`);
        if (!this.graph.hasNode(depId.toString())) {
          if (this.shouldThrowOnMissingDep) {
            throw new Error(`buildOneComponent: missing node of ${depId.toString()}`);
          }
          this.logger.warn(`ignoring missing ${depId.toString()}`);
          return;
        }
        this.graph.setEdge(new Edge(idStr, depId.toString(), getType()));
      });
    });
    this.completed.push(idStr);
    return allDependencies;
  }

  private async loadManyComponents(componentsIds: ComponentID[], dependenciesOf?: string): Promise<Component[]> {
    const components = await mapSeries(componentsIds, async (comp) => {
      const idStr = comp.toString();
      const fromCache = this.loadedComponents[idStr];
      if (fromCache) return fromCache;
      try {
        const component = await this.workspace.get(comp);
        this.loadedComponents[idStr] = component;
        this.graph.setNode(new Node(idStr, component.id));
        return component;
      } catch (err: any) {
        if (
          err instanceof ComponentNotFound ||
          err instanceof ComponentNotFoundInScope ||
          err instanceof ScopeNotFound
        ) {
          if (dependenciesOf && !this.shouldThrowOnMissingDep) {
            this.logger.warn(
              `component ${idStr}, dependency of ${dependenciesOf} was not found. continuing without it`
            );
            return null;
          }
          throw new BitError(
            `error: component "${idStr}" was not found.\nthis component is a dependency of "${
              dependenciesOf || '<none>'
            }" and is needed as part of the graph generation`
          );
        }
        if (dependenciesOf) this.logger.error(`failed loading dependencies of ${dependenciesOf}`);
        throw err;
      }
    });
    return compact(components);
  }
}
