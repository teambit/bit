import { Graph, Node, Edge } from '@teambit/graph.cleargraph';
import { DepEdgeType } from '@teambit/graph';
import { ScopeMain } from '@teambit/scope';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import { Lane } from '@teambit/legacy/dist/scope/models';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { DepEdge } from '@teambit/legacy/dist/scope/models/version';
import { Logger } from '@teambit/logger';

/**
 * we have two groups in this graph.
 * 1. components that are now versioned (this.consumerComponents). they have the new version (which is not in the scope yet).
 * 2. component that are not part of the current snap/tag.
 * this group we want to fetch from the scope. It should be available there, and if not, we can import.
 * it's not possible that this group has new components that never been into the scope, otherwise the tag/snap is failing.
 *
 * given the above. we can simply get the first level of dependencies of the first group.
 * start the graph by adding them all as nodes and edges.
 *
 * this dependencies array may contain components from the first group. we can filter them out. (we don't care about
 * them, they're part of the graph already)
 * we're left with the dependencies that are part of the second group.
 * these dependencies components are retrieved from the scope and as such they have already flattenedEdges.
 * add all these graphs into the main graph. and you're done.
 */
export class FlattenedEdgesGetter {
  private graph = new Graph<ComponentID, DepEdgeType>();
  constructor(
    private scope: ScopeMain,
    private consumerComponents: ConsumerComponent[],
    private logger: Logger,
    private lane?: Lane
  ) {}

  async buildGraph() {
    this.buildTheFirstLevel();
    const idsNotCurrentlySnapped = this.getIdsNotCurrentlySnapped();

    await this.scope.legacyScope.scopeImporter.importWithoutDeps(idsNotCurrentlySnapped, {
      cache: true,
      lane: this.lane,
    });

    const componentsAndVersions = await this.scope.legacyScope.getComponentsAndVersions(idsNotCurrentlySnapped);
    const missingEdges: ComponentID[] = [];
    await Promise.all(
      componentsAndVersions.map(async (componentAndVersion) => {
        const version = componentAndVersion.version;
        const flattenedEdges = await version.getFlattenedEdges(this.scope.legacyScope.objects);
        if (!flattenedEdges.length && version.flattenedDependencies.length) {
          missingEdges.push(componentAndVersion.component.toComponentId());
        }
        this.addFlattenedEdgesToGraph(flattenedEdges);
      })
    );
    await this.addComponentsWithMissingFlattenedEdges(missingEdges);
    return this.graph;
  }

  private async addComponentsWithMissingFlattenedEdges(missingEdges: ComponentID[]) {
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

  private getIdsNotCurrentlySnapped() {
    const allIds = this.graph.nodes.map((node) => node.attr);
    const currentlySnappedIds = ComponentIdList.fromArray(this.consumerComponents.map((comp) => comp.id));
    const filteredIds = allIds.filter((id) => !currentlySnappedIds.has(id));
    return ComponentIdList.fromArray(filteredIds);
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
