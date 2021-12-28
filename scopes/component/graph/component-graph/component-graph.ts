import { Component, ComponentID } from '@teambit/component';
import { Graph } from 'cleargraph';

import { Dependency } from '../model/dependency';
import { DuplicateDependency, VersionSubgraph } from '../duplicate-dependency';

export const DEPENDENCIES_TYPES = ['dependencies', 'devDependencies'];

type Node = { id: string; node: Component };
type Edge = { sourceId: string; targetId: string; edge: Dependency };

export class ComponentGraph extends Graph<Component, Dependency> {
  versionMap: Map<string, { allVersionNodes: string[]; latestVersionNode: string }>;
  seederIds: ComponentID[] = []; // component IDs that started the graph. (if from workspace, the .bitmap ids normally)
  constructor(nodes: Node[] = [], edges: Edge[] = []) {
    super(nodes, edges);
    this.versionMap = new Map();
  }

  protected create(nodes: Node[] = [], edges: Edge[] = []): this {
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
    const seederIdsStr = this.getSeederIdsStr();
    const cyclesWithSeeders = cycles.filter((cycle) => {
      const cycleNoVersions = cycle.map((id) => id.split('@')[0]);
      return cycleNoVersions.some((cycleIdStr) => seederIdsStr.includes(cycleIdStr));
    });
    return cyclesWithSeeders;
  }

  findDuplicateDependencies(): Map<string, DuplicateDependency> {
    const seederIdsNoVersions = this.getSeederIdsStr();
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
    // TODO: once cleargraph constructor and graph.nodes are consistent we should just use this line
    // this.create(graph.nodes, graph.edges)

    const newGraph = new ComponentGraph();
    const newGraphNodes: Node[] = graph.nodes.map((node) => {
      return {
        id: node.id,
        node: node.attr,
      };
    });
    const newGraphEdges: Edge[] = graph.edges.map((edge) => {
      return {
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        edge: edge.attr,
      };
    });
    newGraph.setNodes(newGraphNodes);
    newGraph.setEdges(newGraphEdges);

    return newGraph;
  }

  runtimeOnly(componentIds: string[]) {
    return this.successorsSubgraph(componentIds, (edge) => edge.attr.type === 'runtime');
  }

  private shouldLimitToSeedersOnly() {
    return this.seederIds.length;
  }

  private getSeederIdsStr() {
    return this.seederIds.map((id) => id.toStringWithoutVersion());
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
          const currentCompVersion = this.node(compKey)?.attr.id._legacy.getVersion();
          const latestCompVersion = this.node(value.latestVersionNode)?.attr.id._legacy.getVersion();
          if (!!currentCompVersion && !!latestCompVersion && currentCompVersion.isLaterThan(latestCompVersion)) {
            value.latestVersionNode = compKey;
          }
        }
      }
    }
    return versionMap;
  }
}
