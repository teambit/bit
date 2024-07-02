import { Graph, Node, Edge } from '@teambit/graph.cleargraph';
import { DepEdgeType } from '@teambit/graph';
import { ScopeMain } from '@teambit/scope';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import { Lane } from '@teambit/legacy/dist/scope/models';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { DepEdge } from '@teambit/legacy/dist/scope/models/version';
import { Logger } from '@teambit/logger';
import { pMapPool } from '@teambit/legacy.utils';
import { BitError } from '@teambit/bit-error';

/**
 * the goal of this class is to determine the graph dependencies of a given set of components with minimal effort.
 * it takes advantage of the fact that we save the dependency graph in the `Version` object and tries to reuse it.
 *
 * to optimize it as much as possible, we do it in 4 steps. each step we check whether the graph has missing ids,
 * and if so, continue to the next step.
 *
 * * * First step * * *
 * we have two groups in this graph.
 * 1. components that are now versioned (this.consumerComponents). they have the new version (which is not in the scope yet).
 * 2. component that are not part of the current snap/tag.
 * it's not possible that this group has new components that never been into the scope, otherwise the tag/snap is failing.
 * so we know we can always find the version-object of these components in the scope or import them.
 *
 * given the above. we can simply get the first level of dependencies of the first group.
 * start the graph by adding them all as nodes and edges.
 *
 * this dependencies array may contain components from the first group. we can filter them out. (we don't care about
 * them, they're part of the graph already)
 * we're left with the dependencies that are part of the second group. there are the `missingFromGraph`.
 *
 * * * Second step * * *
 * instead of import these components, we can more efficiently get their previous version from the scope.
 * it must be already in the scope because these are the components we load in the first place.
 * chances are that 99% of the dependencies of the current components objects are identical to the previous version.
 * by adding the flattenedEdges of the previous versions we can probably finish the graph without importing a single
 * component. It's ok that this graph of previous versions has ids that are not relevant to this graph. for example, if
 * we now tag bar@0.0.2, this graph will have bar@0.0.1 although it's not relevant. it's ok, because finally we don't
 * use this graph as a whole. we only pick a component and get its sub-graph, so all irrelevant ids are ignored.
 *
 * * * Third step * * *
 * in case the graph above wasn't enough. we can import the missing components and get their flattenedEdges.
 * all components that were snapped/tagged since around 0.0.8000 have the flattenedEdges saved in the version.
 * older components don't have them and that's why the last step is needed.
 *
 * * * Fourth step * * *
 * this is the worst scenario. we have some old dependencies without flattenedEdges, we have to import them with
 * all their flattened dependencies.
 * once we have all these objects we can iterate them and add them to the graph.
 */
export class FlattenedEdgesGetter {
  private graph = new Graph<ComponentID, DepEdgeType>();
  private missingFromGraph: ComponentID[] = [];
  constructor(
    private scope: ScopeMain,
    private consumerComponents: ConsumerComponent[],
    private logger: Logger,
    private lane?: Lane
  ) {}

  async buildGraph() {
    this.logger.debug('FlattenedEdgesGetter, start');
    this.buildTheFirstLevel();
    this.populateMissingFromGraph();
    if (!this.missingFromGraph.length) {
      return this.graph;
    }
    this.logger.debug(
      `FlattenedEdgesGetter, total ${this.missingFromGraph.length} components missing from graph, trying to find them in previous versions`
    );
    await this.addPreviousGraphs();
    if (!this.missingFromGraph.length) {
      this.logger.debug(`FlattenedEdgesGetter, all missing ids were found in previous versions`);
      return this.graph;
    }
    this.logger.debug(
      `FlattenedEdgesGetter, total ${this.missingFromGraph.length} components missing from graph, trying to import them and load their flattenedEdges`
    );
    await this.importMissingAndAddToGraph();
    if (!this.missingFromGraph.length) {
      this.logger.debug(`FlattenedEdgesGetter, successfully found flattened edges for all components without graph`);
      return this.graph;
    }
    this.logger.debug(
      `FlattenedEdgesGetter, total ${this.missingFromGraph.length} components without graph and their version-objects has no flattened edges, no choice but to import all their flattened deps`
    );
    await this.addComponentsWithMissingFlattenedEdges();
    return this.graph;
  }

  populateFlattenedAndEdgesForComp(component: ConsumerComponent) {
    const graphFromIds = this.graph.successorsSubgraph(component.id.toString());
    const edgesFromGraph = graphFromIds.edges.map((edge) => {
      return {
        source: ComponentID.fromString(edge.sourceId),
        target: ComponentID.fromString(edge.targetId),
        type: edge.attr as DepEdgeType,
      };
    });

    const flattenedFromGraphIncludeItself = graphFromIds.nodes.map((node) => node.attr);
    const flattenedFromGraph = flattenedFromGraphIncludeItself.filter((id) => !id.isEqual(component.id));
    flattenedFromGraph.forEach((dep) => throwWhenDepNotIncluded(component.id, dep));

    component.flattenedDependencies = ComponentIdList.fromArray(flattenedFromGraph);
    component.flattenedEdges = edgesFromGraph;
  }

  private async importMissingAndAddToGraph() {
    const idsWithoutGraphList = ComponentIdList.fromArray(this.missingFromGraph);
    await this.scope.legacyScope.scopeImporter.importWithoutDeps(idsWithoutGraphList, {
      cache: true,
      lane: this.lane,
    });
    const componentsAndVersions = await this.scope.legacyScope.getComponentsAndVersions(idsWithoutGraphList);
    const missingEdges: ComponentID[] = [];
    await Promise.all(
      componentsAndVersions.map(async ({ component, version, versionStr }) => {
        const flattenedEdges = await version.getFlattenedEdges(this.scope.legacyScope.objects);
        if (!flattenedEdges.length && version.flattenedDependencies.length) {
          missingEdges.push(component.toComponentId().changeVersion(versionStr));
        }
        this.addFlattenedEdgesToGraph(flattenedEdges);
      })
    );
    this.missingFromGraph = missingEdges;
  }

  private async addPreviousGraphs() {
    const flattenedDeps: ComponentID[][] = [];
    await pMapPool(
      this.consumerComponents,
      async (comp) => {
        const previousVersion = comp.previouslyUsedVersion;
        if (!previousVersion) return;
        const modelComponent =
          comp.modelComponent || (await this.scope.legacyScope.getModelComponent(comp.id.changeVersion(undefined)));
        const version = await modelComponent.loadVersion(previousVersion, this.scope.legacyScope.objects, true);
        const flattenedEdges = await version.getFlattenedEdges(this.scope.legacyScope.objects);
        if (flattenedEdges.length) flattenedDeps.push(version.flattenedDependencies);
        this.addFlattenedEdgesToGraph(flattenedEdges);
      },
      { concurrency: 50 }
    );

    const flattenedDepsUniq = ComponentIdList.uniqFromArray(flattenedDeps.flat());
    this.missingFromGraph = this.missingFromGraph.filter((id) => !flattenedDepsUniq.has(id));
  }

  private async addComponentsWithMissingFlattenedEdges() {
    const missingEdges = this.missingFromGraph;
    this.logger.warn(`FlattenedEdgesGetter, found ${missingEdges.length} components with missing flattened edges:
${missingEdges.map((e) => e.toString()).join('\n')}`);
    const missingEdgesList = ComponentIdList.fromArray(missingEdges);
    const results = await this.scope.legacyScope.scopeImporter.importMany({
      ids: missingEdgesList,
      cache: true,
      lane: this.lane,
      preferDependencyGraph: false, // we know it does not have a dependency graph
    });
    const allFlattened = results.map((result) => result.version.flattenedDependencies);
    allFlattened.push(missingEdgesList);
    const allFlattenedUniq = ComponentIdList.uniqFromArray(allFlattened.flat());
    const componentsAndVersions = await this.scope.legacyScope.getComponentsAndVersions(
      ComponentIdList.fromArray(allFlattenedUniq)
    );
    componentsAndVersions.forEach(({ component, version, versionStr }) => {
      const compId = component.toComponentId().changeVersion(versionStr);
      this.graph.setNode(new Node(compId.toString(), compId));
      this.addEdges(compId, version.dependencies, 'prod');
      this.addEdges(compId, version.devDependencies, 'dev');
      this.addEdges(compId, version.extensionDependencies, 'ext');
    });
  }

  private addFlattenedEdgesToGraph(flattenedEdges: DepEdge[]) {
    flattenedEdges.forEach(({ source, target, type }) => {
      this.graph.setNode(new Node(source.toString(), source));
      this.graph.setNode(new Node(target.toString(), target));
      this.graph.setEdge(new Edge(source.toString(), target.toString(), type));
    });
  }

  private populateMissingFromGraph() {
    const allIds = this.graph.nodes.map((node) => node.attr);
    const currentlySnappedIds = ComponentIdList.fromArray(this.consumerComponents.map((comp) => comp.id));
    const filteredIds = allIds.filter((id) => !currentlySnappedIds.has(id));
    this.missingFromGraph = filteredIds;
  }

  private buildTheFirstLevel() {
    this.consumerComponents.forEach((comp) => {
      const id = comp.id;
      this.graph.setNode(new Node(id.toString(), id));
      this.addEdges(comp.id, comp.dependencies, 'prod');
      this.addEdges(comp.id, comp.devDependencies, 'dev');
      this.addEdges(comp.id, comp.extensionDependencies, 'ext');
    });
  }

  private addEdges(compId: ComponentID, dependencies: ConsumerComponent['dependencies'], label: DepEdgeType) {
    dependencies.get().forEach((dep) => {
      this.graph.setNode(new Node(dep.id.toString(), dep.id));
      this.graph.setEdge(new Edge(compId.toString(), dep.id.toString(), label));
    });
  }
}

function throwWhenDepNotIncluded(componentId: ComponentID, dependencyId: ComponentID) {
  if (!dependencyId.hasScope() && !dependencyId.hasVersion()) {
    throw new BitError(`fatal: "${componentId.toString()}" has a dependency "${dependencyId.toString()}".
this dependency was not included in the tag command.`);
  }
}
