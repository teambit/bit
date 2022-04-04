import { Component, ComponentID } from '@teambit/component';
import { Graph, Node, Edge } from '@teambit/graph.cleargraph';

import { Dependency } from '../model/dependency';
import { DuplicateDependency, VersionSubgraph } from '../duplicate-dependency';

export const DEPENDENCIES_TYPES = ['dependencies', 'devDependencies'];

type ComponentNode = Node<Component>;
type DependencyEdge = Edge<Dependency>;

export class ComponentGraph extends Graph<Component, Dependency> {
  versionMap: Map<string, { allVersionNodes: string[]; latestVersionNode: string }>;
  seederIds: ComponentID[] = []; // component IDs that started the graph. (if from workspace, the .bitmap ids normally)
  constructor(nodes: ComponentNode[] = [], edges: DependencyEdge[] = []) {
    super(nodes, edges);
    this.versionMap = new Map();
  }

  protected create(nodes: ComponentNode[] = [], edges: DependencyEdge[] = []): this {
    return new ComponentGraph(nodes, edges) as this;
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
    const seederIdsNoVersions = this.seederIds.map((id) => id.toStringWithoutVersion());
    const duplicateDependencies: Map<string, DuplicateDependency> = new Map();
    for (const [compFullName, versions] of this.versionMap) {
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

  _calculateVersionMap() {
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
          const currentComp = this.node(compKey)?.attr;
          const latestComp = this.node(value.latestVersionNode)?.attr;
          const isLegacy = !currentComp?.head || !latestComp?.head;

          if (isLegacy) {
            const currentCompVersion = currentComp?.id._legacy.getVersion();
            const latestCompVersion = latestComp?.id._legacy.getVersion();
            if (!!currentCompVersion && !!latestCompVersion && currentCompVersion.isLaterThan(latestCompVersion)) {
              value.latestVersionNode = compKey;
            }
          } else if (new Date(currentComp.head.timestamp) > new Date(latestComp.head.timestamp)) {
            value.latestVersionNode = compKey;
          }
        }
      }
    }
    return versionMap;
  }
}
