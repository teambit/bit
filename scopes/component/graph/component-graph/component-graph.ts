import { Component, ComponentFactory } from '@teambit/component';
import { Workspace } from '@teambit/workspace';
import { buildOneGraphForComponents } from 'bit-bin/dist/scope/graph/components-graph';
import { Graph } from 'cleargraph';
import { Graph as LegacyGraph } from 'graphlib';

import { Dependency } from '../model/dependency';
import { DuplicateDependency, VersionSubgraph } from '../duplicate-dependency';

export const DEPENDENCIES_TYPES = ['dependencies', 'devDependencies'];

type Node = { id: string; node: Component };
type Edge = { sourceId: string; targetId: string; edge: Dependency };

export class ComponentGraph extends Graph<Component, Dependency> {
  versionMap: Map<string, { allVersionNodes: string[]; latestVersionNode: string }>;
  constructor(nodes: Node[] = [], edges: Edge[] = []) {
    super(nodes, edges);
    this.versionMap = new Map();
  }

  protected create(nodes: Node[] = [], edges: Edge[] = []): this {
    return new ComponentGraph(nodes, edges) as this;
  }

  static async buildFromLegacy(legacyGraph: LegacyGraph, componentFactory: ComponentFactory): Promise<ComponentGraph> {
    const newGraph = new ComponentGraph();

    const setNodeP = legacyGraph.nodes().map(async (nodeId) => {
      const componentId = await componentFactory.resolveComponentId(nodeId);
      const component = await componentFactory.get(componentId);
      if (component) {
        newGraph.setNode(componentId.toString(), component);
      }
    });
    await Promise.all(setNodeP);

    const setEdgePromise = legacyGraph.edges().map(async (edgeId) => {
      const source = await componentFactory.resolveComponentId(edgeId.v);
      const target = await componentFactory.resolveComponentId(edgeId.w);
      const edgeObj =
        legacyGraph.edge(edgeId.v, edgeId.w) === 'dependencies' ? new Dependency('runtime') : new Dependency('dev');
      newGraph.setEdge(source.toString(), target.toString(), edgeObj);
    });
    await Promise.all(setEdgePromise);

    newGraph.versionMap = newGraph._calculateVersionMap();
    return newGraph;
  }

  static async build(workspace: Workspace, componentFactory: ComponentFactory) {
    const ids = (await workspace.list()).map((comp) => comp.id);
    const bitIds = ids.map((id) => id._legacy);
    const initialGraph = await buildOneGraphForComponents(bitIds, workspace.consumer);
    return this.buildFromLegacy(initialGraph, componentFactory);
  }

  findDuplicateDependencies(): Map<string, DuplicateDependency> {
    const duplicateDependencies: Map<string, DuplicateDependency> = new Map();
    for (const [compFullName, versions] of this.versionMap) {
      if (versions.allVersionNodes.length > 1) {
        const versionSubgraphs: VersionSubgraph[] = [];
        const notLatestVersions = versions.allVersionNodes.filter((version) => version !== versions.latestVersionNode);
        notLatestVersions.forEach((version) => {
          const predecessors = this.predecessorsSubgraph(version);
          const immediatePredecessors = [...this.predecessors(version).keys()];
          const subGraph = this.buildFromCleargraph(predecessors);
          const versionSubgraph: VersionSubgraph = {
            versionId: version,
            subGraph,
            immediateDependents: immediatePredecessors,
          };
          versionSubgraphs.push(versionSubgraph);
        });
        if (versionSubgraphs.length > 0) {
          const duplicateDep = new DuplicateDependency(versions.latestVersionNode, versionSubgraphs);
          duplicateDependencies.set(compFullName, duplicateDep);
        }
      }
    }
    return duplicateDependencies;
  }

  buildFromCleargraph(graph: Graph<Component, Dependency>) {
    const newGraph = new ComponentGraph();
    const newGraphNodes: Node[] = [];
    const newGraphEdges: Edge[] = [];
    for (const [nodeId, node] of graph.nodes.entries()) {
      newGraphNodes.push({
        id: nodeId,
        node,
      });
    }
    for (const [edgeId, edge] of graph.edges.entries()) {
      const { sourceId, targetId } = graph.edgeNodesById(edgeId);
      if (!!sourceId && !!targetId) {
        newGraphEdges.push({
          sourceId,
          targetId,
          edge,
        });
      }
    }
    newGraph.setNodes(newGraphNodes);
    newGraph.setEdges(newGraphEdges);
    return newGraph;
  }

  runtimeOnly(componentIds: string[]) {
    return this.successorsSubgraph(componentIds, (edge) => edge.type === 'runtime');
  }

  _calculateVersionMap() {
    const versionMap: Map<string, { allVersionNodes: string[]; latestVersionNode: string }> = new Map();
    for (const [compKey, comp] of this.nodes.entries()) {
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
          const currentCompVersion = this.node(compKey)?.id._legacy.getVersion();
          const latestCompVersion = this.node(value.latestVersionNode)?.id._legacy.getVersion();
          if (!!currentCompVersion && !!latestCompVersion && currentCompVersion.isLaterThan(latestCompVersion)) {
            value.latestVersionNode = compKey;
          }
        }
      }
    }
    return versionMap;
  }
}
