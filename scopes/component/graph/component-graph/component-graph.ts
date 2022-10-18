import { Component, ComponentID } from '@teambit/component';
import { Graph, Node, Edge } from '@teambit/graph.cleargraph';
import { uniq } from 'lodash';

import { Dependency } from '../model/dependency';
import { DuplicateDependency, VersionSubgraph } from '../duplicate-dependency';

export const DEPENDENCIES_TYPES = ['dependencies', 'devDependencies'];

type ComponentNode = Node<Component>;
type DependencyEdge = Edge<Dependency>;

export class ComponentGraph extends Graph<Component, Dependency> {
  seederIds: ComponentID[] = []; // component IDs that started the graph. (if from workspace, the .bitmap ids normally)
  constructor(nodes: ComponentNode[] = [], edges: DependencyEdge[] = []) {
    super(nodes, edges);
  }

  protected create(nodes: ComponentNode[] = [], edges: DependencyEdge[] = []): this {
    return new ComponentGraph(nodes, edges) as this;
  }

  /**
   * check all the routes from the sources to targets and return the components found during this traversal.
   * e.g.
   * A -> B -> C -> N.
   * A -> E -> N.
   * B -> F -> G.
   * given source: A, targets: N. The results will be: B, C, E
   */
  findIdsFromSourcesToTargets(sources: ComponentID[], targets: ComponentID[]): ComponentID[] {
    const removeVerFromIdStr = (idStr: string) => idStr.split('@')[0];
    const sourcesStr = sources.map((s) => s.toStringWithoutVersion());
    const targetsStr = targets.map((t) => t.toStringWithoutVersion());
    const allFlattened = sources.map((source) => this.successors(source.toString())).flat();
    const allFlattenedIds = uniq(allFlattened.map((f) => f.id));
    const results: string[] = [];
    allFlattenedIds.forEach((id) => {
      const idWithNoVer = removeVerFromIdStr(id);
      if (sourcesStr.includes(idWithNoVer) || targetsStr.includes(idWithNoVer)) return;
      const allSuccessors = this.successors(id);
      const allSuccessorsWithNoVersion = allSuccessors.map((s) => removeVerFromIdStr(s.id));
      if (allSuccessorsWithNoVersion.find((s) => targetsStr.includes(s))) results.push(id);
    });
    const components = this.getNodes(results).map((n) => n.attr);

    return components.map((c) => c.id);
  }

  /**
   * overrides the super class to eliminate non-seeders components
   */
  findCycles(graph?: this): string[][] {
    const cycles = super.findCycles(graph);
    if (!this.shouldLimitToSeedersOnly()) {
      return cycles;
    }
    const seederIdsStr = this.seederIds.map((id) => id.toString());
    const cyclesWithSeeders = cycles.filter((cycle) => {
      return cycle.some((cycleIdStr) => seederIdsStr.includes(cycleIdStr));
    });
    return cyclesWithSeeders;
  }

  findDuplicateDependencies(): Map<string, DuplicateDependency> {
    const versionMap = this.calculateVersionMap();
    const seederIdsNoVersions = this.seederIds.map((id) => id.toStringWithoutVersion());
    const duplicateDependencies: Map<string, DuplicateDependency> = new Map();
    for (const [compFullName, versions] of versionMap) {
      if (versions.allVersionNodes.length > 1) {
        const versionSubgraphs: VersionSubgraph[] = [];
        const notLatestVersions = versions.allVersionNodes.filter((version) => version !== versions.latestVersionNode);
        notLatestVersions.forEach((version) => {
          const predecessors = this.predecessorsSubgraph(version);
          const immediatePredecessors = this.predecessors(version).map((predecessor) => predecessor.id);
          const subGraph = this.buildFromCleargraph(predecessors);
          const versionSubgraph: VersionSubgraph = {
            versionId: version,
            subGraph,
            // TODO: validate that this is working correctly
            immediateDependents: immediatePredecessors,
          };
          versionSubgraphs.push(versionSubgraph);
        });
        const isSeeder = seederIdsNoVersions.includes(compFullName);
        const shouldDisplayDueToBeingSeeder = !this.shouldLimitToSeedersOnly() || isSeeder;
        if (shouldDisplayDueToBeingSeeder && versionSubgraphs.length > 0) {
          const duplicateDep = new DuplicateDependency(versions.latestVersionNode, versionSubgraphs);
          duplicateDependencies.set(compFullName, duplicateDep);
        }
      }
    }
    return duplicateDependencies;
  }

  buildFromCleargraph(graph: Graph<Component, Dependency>): ComponentGraph {
    return this.create(graph.nodes, graph.edges);
  }

  runtimeOnly(componentIds: string[]) {
    return this.successorsSubgraph(componentIds, {
      edgeFilter: (edge: DependencyEdge) => edge.attr.type === 'runtime',
    });
  }

  private shouldLimitToSeedersOnly() {
    return this.seederIds.length;
  }

  private calculateVersionMap(): Map<string, { allVersionNodes: string[]; latestVersionNode: string }> {
    const versionMap: Map<string, { allVersionNodes: string[]; latestVersionNode: string }> = new Map();
    for (const node of this.nodes) {
      const comp = node.attr;
      const compKey = node.id;
      const compFullName = comp.id._legacy.toStringWithoutVersion();
      if (!versionMap.has(compFullName)) {
        versionMap.set(compFullName, {
          allVersionNodes: [compKey],
          latestVersionNode: compKey,
        });
      } else {
        const value = versionMap.get(compFullName);
        if (value) {
          if (Object.prototype.hasOwnProperty.call(value, 'allVersionNodes')) {
            value.allVersionNodes.push(compKey);
          }
          const currentComp = comp;
          const latestComp = this.node(value.latestVersionNode)?.attr;
          // @todo: this check won't work when the component doesn't have head.
          // it happens when a dependency is needed in an old version (not head). which Bit doesn't fetch the head
          // Version object, and as a result, the `Component.head` is empty.
          // for now it's probably good enough because it's used only for `findDuplicateDependencies`, which only
          // checks the components on the workspace.
          if (
            currentComp.head &&
            latestComp?.head &&
            new Date(currentComp.head.timestamp) > new Date(latestComp.head.timestamp)
          ) {
            value.latestVersionNode = compKey;
          }
        }
      }
    }
    return versionMap;
  }
}
