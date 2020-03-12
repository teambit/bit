import { Graph } from 'cleargraph';
import { Graph as LegacyGraph } from 'graphlib';
import Component from '../../component/component';
import { Dependency } from '../index';
import { Workspace } from '../../workspace';
import { buildOneGraphForComponents } from '../../../scope/graph/components-graph';
import ComponentFactory from '../../component/component-factory';
import Version from '../../../version';

export const DEPENDENCIES_TYPES = ['dependencies', 'devDependencies', 'compilerDependencies', 'testerDependencies'];

export class ComponentGraph extends Graph<Component, Dependency> {
  versionMap: Map<string, { allVersionNodes: string[]; latestVersionNode: string }>;
  constructor(
    nodes: { id: string; node: Component }[] = [],
    edges: { sourceId: string; targetId: string; edge: Dependency }[] = []
  ) {
    super(nodes, edges);
    this.versionMap = new Map();
  }
  static buildFromLegacy(legacyGraph: LegacyGraph, componentFactory: ComponentFactory): Graph<Component, Dependency> {
    let newGraph = new ComponentGraph();
    legacyGraph.nodes().forEach(nodeId => {
      newGraph.setNode(nodeId, componentFactory.fromLegacyComponent(legacyGraph.node(nodeId)));
    });
    legacyGraph.edges().forEach(edgeId => {
      const source = edgeId.v;
      const target = edgeId.w;
      const edgeObj =
        legacyGraph.edge(source, target) === 'dependencies' ? new Dependency('runtime') : new Dependency('dev');
      newGraph.setEdge(source, target, edgeObj);
    });
    newGraph.versionMap = newGraph._calculateVersionMap();
    return newGraph;
  }

  static async build(workspace: Workspace, componentFactory: ComponentFactory) {
    const ids = (await workspace.list()).map(comp => comp.id);
    const bitIds = ids.map(id => id._legacy);
    const initialGraph = await buildOneGraphForComponents(bitIds, workspace.consumer);
    return this.buildFromLegacy(initialGraph, componentFactory);
  }

  findDuplicateDependencies() {}

  _calculateVersionMap() {
    let versionMap: Map<string, { allVersionNodes: string[]; latestVersionNode: string }> = new Map();
    for (const [compKey, comp] of this.nodes.entries()) {
      const compFullName = comp.id._legacy.toStringWithoutVersion();
      if (!versionMap.has(compFullName)) {
        versionMap.set(compFullName, {
          allVersionNodes: [compKey],
          latestVersionNode: compKey
        });
      } else {
        let value = versionMap.get(compFullName);
        if (!!value) {
          if (value.hasOwnProperty('allVersionNodes')) {
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
