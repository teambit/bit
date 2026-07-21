import mapSeries from 'p-map-series';
import { Graph, Node, Edge } from '@teambit/graph.cleargraph';
import { chunk, flatten } from 'lodash';
import type { Consumer } from '@teambit/legacy.consumer';
import type { Component, ComponentID } from '@teambit/component';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import { ComponentIdList } from '@teambit/component-id';
import type { Lane } from '@teambit/objects';
import { ComponentNotFound, ScopeNotFound } from '@teambit/legacy.scope';
import { ComponentNotFound as ComponentNotFoundInScope } from '@teambit/scope';
import compact from 'lodash.compact';
import type { Logger } from '@teambit/logger';
import { BitError } from '@teambit/bit-error';
import type { Workspace } from './workspace';

export type ShouldLoadFunc = (id: ComponentID) => Promise<boolean>;

export class GraphFromFsBuilder {
  private graph = new Graph<Component, string>();
  private completed = new Set<string>();
  private depth = 1;
  private consumer: Consumer;
  private importedIds = new Set<string>();
  private currentLane: Lane | undefined;
  private ignoreIds: Set<string>;
  constructor(
    private workspace: Workspace,
    private logger: Logger,
    private dependencyResolver: DependencyResolverMain,
    ignoreIds: string[] = [],
    private shouldLoadItsDeps?: ShouldLoadFunc,
    private shouldThrowOnMissingDep = true
  ) {
    this.consumer = this.workspace.consumer;
    this.ignoreIds = new Set(ignoreIds);
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
   * LAZY IMPORT MODE (when shouldLoadItsDeps is provided):
   * when a filter function (shouldLoadItsDeps) is provided, we use "lazy import" mode to optimize
   * performance. instead of importing all flattened dependencies at once, we:
   * 1. only import dependencies that pass the filter (e.g., only aspects)
   * 2. don't fetch their flattened dependencies upfront (includeDependencies: false)
   * 3. let the recursive depth iteration handle importing deps as needed
   * this is much more efficient when building filtered graphs (e.g., aspects-only graph) because
   * we avoid fetching huge dependency trees for components we don't care about.
   *
   * TRADITIONAL MODE (without filter):
   * normally, one importMany of the seeders is enough as importMany knows to fetch all flattened.
   * however, since this buildGraph is performed on the workspace, a dependency may be new or
   * modified and as such, we don't know its flattened yet.
   */
  async buildGraph(ids: ComponentID[]): Promise<Graph<Component, string>> {
    this.logger.debug(`GraphFromFsBuilder, buildGraph with ${ids.length} seeders`);
    const start = Date.now();
    const components = await this.loadManyComponents(ids);
    this.currentLane = await this.workspace.consumer.getCurrentLaneObject();
    await this.processManyComponents(components);
    this.logger.debug(
      `GraphFromFsBuilder, buildGraph with ${ids.length} seeders completed (${(Date.now() - start) / 1000} sec)`
    );
    return this.graph;
  }

  private async getAllDepsUnfiltered(component: Component): Promise<ComponentID[]> {
    // installed legacy-core envs (react/node/... that used to be core aspects) are resolved from the
    // workspace node_modules by the aspects-loader, not from their model graph. don't walk their
    // dependency graph here - doing so imports their ENTIRE component closure (hundreds of comps,
    // incl. UI/docs) from the remote, which is very slow and unnecessary since the packages are
    // installed. only applies to the filtered aspects-graph (shouldLoadItsDeps provided); the
    // unfiltered graph still needs the complete dependency graph.
    if (this.shouldLoadItsDeps && this.isInstalledLegacyEnvLeaf(component)) return [];
    const deps = await this.dependencyResolver.getComponentDependencies(component);
    const depsIds = deps.map((dep) => dep.componentId);

    return depsIds.filter((depId) => !this.ignoreIds.has(depId.toString()));
  }

  /**
   * whether the given component is a legacy-core env consumed as an installed package (not authored
   * in the workspace). such envs and their aspect closure are resolved from node_modules by the
   * workspace-aspects-loader, so we leaf them in the filtered aspects-graph to avoid importing their
   * closure from the remote.
   */
  private isInstalledLegacyEnvLeaf(component: Component): boolean {
    const idWithoutVersion = component.id.toStringWithoutVersion();
    if (!this.workspace.envs.isLegacyCoreEnv(idWithoutVersion)) return false;
    // a legacy-core env authored in this workspace has its deps as workspace components - walk it
    // normally. only leaf the ones consumed as installed packages.
    return !this.workspace.hasId(component.id, { ignoreVersion: true });
  }

  private async getAllDepsFiltered(component: Component): Promise<ComponentID[]> {
    const depsWithoutIgnore = await this.getAllDepsUnfiltered(component);
    const shouldLoadFunc = this.shouldLoadItsDeps;
    if (!shouldLoadFunc) return depsWithoutIgnore;
    const deps = await mapSeries(depsWithoutIgnore, async (depId) => {
      const shouldLoad = await shouldLoadFunc(depId);
      if (!shouldLoad) this.ignoreIds.add(depId.toString());
      return shouldLoad ? depId : null;
    });
    return compact(deps);
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
   *
   * when `shouldLoadItsDeps` is provided, we use "lazy import" mode:
   * - only import filtered dependencies (those passing the shouldLoadItsDeps check)
   * - use preferDependencyGraph to avoid fetching flattened dependencies
   * - the recursive depth iteration will handle importing deps as needed
   * this is much more efficient when building a filtered graph (e.g., aspects-only graph)
   *
   * without a filter, we use the traditional approach:
   * - `importMany` fetches all flattened dependencies (preferDependencyGraph: false)
   * - once a component from scope is imported, all its flattened dependencies are there
   */
  private async importObjects(components: Component[]) {
    const workspaceIds = this.workspace.listIds();

    // when shouldLoadItsDeps is provided, use lazy import: only import filtered deps without their flattened
    const useLazyImport = Boolean(this.shouldLoadItsDeps);
    // in lazy mode the components were imported without their flattened dependencies
    // (preferDependencyGraph), so deps of scope components are not guaranteed to exist locally.
    // batch-import the direct deps of ALL this-level components in one round-trip. don't list
    // them via getAllDepsFiltered - the filter itself loads every dep (workspace.get), which
    // fetches each missing dep individually: a network round-trip per graph node.
    const compsToImportDepsFor = useLazyImport
      ? components
      : components.filter((comp) => workspaceIds.find((id) => id.isEqual(comp.id)));

    const allDeps = (await Promise.all(compsToImportDepsFor.map((c) => this.getAllDepsUnfiltered(c)))).flat();
    const allDepsNotImported = allDeps.filter((d) => !this.importedIds.has(d.toString()));
    const exportedDeps = allDepsNotImported.map((id) => id).filter((dep) => this.workspace.isExported(dep));
    const scopeComponentsImporter = this.consumer.scope.scopeImporter;
    let uniqDeps: ComponentID[] = ComponentIdList.uniqFromArray(exportedDeps);
    if (useLazyImport) {
      // in lazy mode, only import deps whose objects are missing locally. importMany is not free
      // even when nothing needs fetching (it materializes VersionDependencies for every id), and
      // graph builds run repeatedly per command (envs loading, isolation, compilation) - passing
      // hundreds of already-local ids each time OOMs constrained machines (e.g. CI containers).
      const defs = await this.consumer.scope.sources.getMany(uniqDeps);
      uniqDeps = defs.filter((def) => !def.component).map((def) => def.id);
    }
    // import in bounded chunks: one big importMany holds all the fetched objects and their
    // VersionDependencies in memory at once, which OOMs constrained machines on big graphs.
    // chunking keeps the round-trips low while letting each batch be GC'ed.
    const chunks = chunk(uniqDeps, 50);
    await mapSeries(chunks, (depsChunk) =>
      scopeComponentsImporter.importMany({
        ids: ComponentIdList.fromArray(depsChunk),
        preferDependencyGraph: useLazyImport,
        // in lazy mode this is a best-effort batch prefetch of an unfiltered dep list - deps that
        // fail to import are handled later by loadManyComponents (warn/throw per shouldThrowOnMissingDep)
        throwForDependencyNotFound: useLazyImport ? false : this.shouldThrowOnMissingDep,
        throwForSeederNotFound: useLazyImport ? false : this.shouldThrowOnMissingDep,
        reFetchUnBuiltVersion: false,
        lane: this.currentLane,
        reason: useLazyImport
          ? 'for building a filtered graph from the workspace (lazy)'
          : 'for building a graph from the workspace',
      })
    );
    allDepsNotImported.forEach((id) => this.importedIds.add(id.toString()));
  }

  private async processOneComponent(component: Component) {
    const idStr = component.id.toString();
    if (this.completed.has(idStr)) return [];
    // leaf installed legacy-core envs: keep the node in the graph but don't walk/edge its deps (they
    // are resolved from node_modules by the aspects-loader). setting edges here would reference nodes
    // that were intentionally not imported and throw "missing node".
    if (this.shouldLoadItsDeps && this.isInstalledLegacyEnvLeaf(component)) {
      this.completed.add(idStr);
      return [];
    }
    const allIds = await this.getAllDepsFiltered(component);

    const allDependenciesComps = await this.loadManyComponents(allIds, idStr);
    const deps = await this.dependencyResolver.getComponentDependencies(component);
    deps.forEach((dep) => {
      const depId = dep.componentId;
      if (this.ignoreIds.has(depId.toString())) return;
      if (!this.graph.hasNode(depId.toString())) {
        if (this.shouldThrowOnMissingDep) {
          throw new Error(`buildOneComponent: missing node of ${depId.toString()}`);
        }
        this.logger.warn(`ignoring missing ${depId.toString()}`);
        return;
      }
      this.graph.setEdge(new Edge(idStr, depId.toString(), dep.lifecycle));
    });

    this.completed.add(idStr);
    return allDependenciesComps;
  }

  private async loadManyComponents(componentsIds: ComponentID[], dependenciesOf?: string): Promise<Component[]> {
    const components = await mapSeries(componentsIds, async (comp) => {
      const idStr = comp.toString();
      const fromGraph = this.graph.node(idStr)?.attr;
      if (fromGraph) return fromGraph;
      try {
        const component = await this.workspace.get(comp);
        this.graph.setNode(new Node(idStr, component));
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
