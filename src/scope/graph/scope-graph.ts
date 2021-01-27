import GraphLib, { Graph } from 'graphlib';

import { BitId, BitIds } from '../../bit-id';
import { VERSION_DELIMITER } from '../../constants';
import ComponentsList from '../../consumer/component/components-list';
import Component from '../../consumer/component/consumer-component';
import { DEPENDENCIES_TYPES_UI_MAP } from '../../consumer/component/dependencies/dependencies';
import Consumer from '../../consumer/consumer';
import { getLatestVersionNumber } from '../../utils';
import { ModelComponent, Version } from '../models';
import Scope from '../scope';

export type DependenciesInfo = {
  id: BitId;
  depth: number;
  parent: string;
  dependencyType: string;
};

export default class DependencyGraph {
  graph: Graph;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  scopeName: string;

  constructor(graph: Graph) {
    this.graph = graph;
  }

  setScopeName(scopeName: string) {
    this.scopeName = scopeName;
  }

  static async loadAllVersions(scope: Scope): Promise<DependencyGraph> {
    const graph = await DependencyGraph.buildGraphWithAllVersions(scope);
    return new DependencyGraph(graph);
  }

  static async loadLatest(scope: Scope): Promise<DependencyGraph> {
    const graph = await DependencyGraph.buildGraphFromScope(scope);
    return new DependencyGraph(graph);
  }

  static loadFromString(str: object): DependencyGraph {
    const graph = GraphLib.json.read(str);
    // when getting a graph from a remote scope, the class BitId is gone and only the object is received
    graph.nodes().forEach((node) => {
      const id = graph.node(node);
      if (!(id instanceof BitId)) {
        graph.setNode(node, new BitId(id));
      }
    });
    return new DependencyGraph(graph);
  }

  /**
   * @todo: refactor this to work with the newer method `buildGraphFromScope`.
   */
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  static async buildGraphWithAllVersions(scope: Scope): Promise<Graph> {
    const graph = new Graph({ compound: true });
    const depObj: { [id: string]: Version } = {};
    const allComponents = await scope.list();
    // build all nodes. a node is either a Version object or Component object.
    // each Version node has a parent of Component node. Component node doesn't have a parent.
    await Promise.all(
      allComponents.map(async (component) => {
        graph.setNode(component.id(), component);
        await Promise.all(
          Object.keys(component.versionsIncludeOrphaned).map(async (version) => {
            const componentVersion = await component.loadVersion(version, scope.objects, false);
            if (!componentVersion) return;
            const idWithVersion = `${component.id()}${VERSION_DELIMITER}${version}`;
            graph.setNode(idWithVersion, componentVersion);
            graph.setParent(idWithVersion, component.id());
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            componentVersion.id = component.toBitId();
            depObj[idWithVersion] = componentVersion;
          })
        );
      })
    );
    // set all edges
    // @todo: currently the label is "require". Change it to be "direct" and "indirect" depends on whether it comes from
    // flattenedDependencies or from dependencies.
    Object.keys(depObj).forEach((id) =>
      depObj[id].flattenedDependencies.forEach((dep) => graph.setEdge(id, dep.toString(), 'require'))
    );
    return graph;
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  static async buildGraphFromScope(scope: Scope): Promise<Graph> {
    const graph = new Graph();
    const allModelComponents: ModelComponent[] = await scope.list();
    const buildGraphP = allModelComponents.map(async (modelComponent) => {
      const buildVersionP = modelComponent.listVersionsIncludeOrphaned().map(async (versionNum) => {
        const version = await modelComponent.loadVersion(versionNum, scope.objects, false);
        if (!version) {
          // a component might be in the scope with only the latest version
          return;
        }
        const id = modelComponent.toBitId().changeVersion(versionNum);
        this._addDependenciesToGraph(id, graph, version);
      });
      await Promise.all(buildVersionP);
    });
    await Promise.all(buildGraphP);
    return graph;
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  static async buildGraphFromWorkspace(consumer: Consumer, onlyLatest = false, reverse = false): Promise<Graph> {
    const componentsList = new ComponentsList(consumer);
    const workspaceComponents: Component[] = await componentsList.getFromFileSystem();
    const graph = new Graph();
    const allModelComponents: ModelComponent[] = await consumer.scope.list();
    const buildGraphP = allModelComponents.map(async (modelComponent) => {
      const latestVersion = modelComponent.latest();
      const buildVersionP = modelComponent.listVersionsIncludeOrphaned().map(async (versionNum) => {
        if (onlyLatest && latestVersion !== versionNum) return;
        const id = modelComponent.toBitId().changeVersion(versionNum);
        const componentFromWorkspace = workspaceComponents.find((comp) => comp.id.isEqual(id));
        // if the same component exists in the workspace, use it as it might be modified
        const version =
          componentFromWorkspace || (await modelComponent.loadVersion(versionNum, consumer.scope.objects, false));
        if (!version) {
          // a component might be in the scope with only the latest version (happens when it's a nested dep)
          return;
        }
        this._addDependenciesToGraph(id, graph, version, reverse);
      });
      await Promise.all(buildVersionP);
    });
    await Promise.all(buildGraphP);
    workspaceComponents.forEach((component: Component) => {
      const id = component.id;
      this._addDependenciesToGraph(id, graph, component, reverse);
    });
    return graph;
  }

  /**
   * ignore nested dependencies. build the graph from only imported and authored components
   * according to currently used versions (.bitmap versions).
   * returns a graph that each node is a BitId object.
   */
  static async buildGraphFromCurrentlyUsedComponents(consumer: Consumer): Promise<Graph> {
    const componentsList = new ComponentsList(consumer);
    const workspaceComponents: Component[] = await componentsList.getAuthoredAndImportedFromFS();
    const graph = new Graph();
    workspaceComponents.forEach((component: Component) => {
      const id = component.id;
      this._addDependenciesToGraph(id, graph, component);
    });
    return graph;
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  static _addDependenciesToGraph(id: BitId, graph: Graph, component: Version | Component, reverse = false): void {
    const idStr = id.toString();
    // save the full BitId of a string id to be able to retrieve it later with no confusion
    if (!graph.hasNode(idStr)) graph.setNode(idStr, id);
    Object.entries(component.depsIdsGroupedByType).forEach(([depType, depIds]) => {
      depIds.forEach((dependencyId) => {
        const depIdStr = dependencyId.toString();
        if (!graph.hasNode(depIdStr)) graph.setNode(depIdStr, dependencyId);
        if (reverse) {
          graph.setEdge(depIdStr, idStr, depType);
        } else {
          graph.setEdge(idStr, depIdStr, depType);
        }
      });
    });
  }

  /**
   * returns a new Graph that has only nodes that are related to the given id.
   * (meaning, they're either dependents or dependencies)
   */
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  getSubGraphOfConnectedComponents(id: BitId): Graph {
    const connectedGraphs = GraphLib.alg.components(this.graph);
    const idWithVersion = this._getIdWithLatestVersion(id);
    const graphWithId = connectedGraphs.find((graph) => graph.includes(idWithVersion.toString()));
    if (!graphWithId) {
      throw new Error(`${id.toString()} is missing from the dependency graph`);
    }
    return this.graph.filterNodes((node) => graphWithId.includes(node));
  }

  getDependenciesInfo(id: BitId): DependenciesInfo[] {
    const idWithVersion = this._getIdWithLatestVersion(id);
    const dijkstraResults = GraphLib.alg.dijkstra(this.graph, idWithVersion.toString());
    const dependencies: DependenciesInfo[] = [];
    Object.keys(dijkstraResults).forEach((idStr) => {
      const distance = dijkstraResults[idStr].distance;
      if (distance === Infinity || distance === 0) {
        // there is no dependency or it's the same component (distance zero)
        return;
      }
      const predecessor = dijkstraResults[idStr].predecessor;
      const dependencyType = this.graph.edge(predecessor, idStr);
      dependencies.push({
        id: this.graph.node(idStr),
        depth: distance,
        parent: predecessor,
        dependencyType: DEPENDENCIES_TYPES_UI_MAP[dependencyType],
      });
    });
    dependencies.sort((a, b) => a.depth - b.depth);
    return dependencies;
  }

  getDependentsInfo(id: BitId): DependenciesInfo[] {
    const idWithVersion = this._getIdWithLatestVersion(id);
    const edgeFunc = (v) => this.graph.inEdges(v);
    // @ts-ignore (incorrect types in @types/graphlib)
    const dijkstraResults = GraphLib.alg.dijkstra(this.graph, idWithVersion.toString(), undefined, edgeFunc);
    const dependents: DependenciesInfo[] = [];
    Object.keys(dijkstraResults).forEach((idStr) => {
      const distance = dijkstraResults[idStr].distance;
      if (distance === Infinity || distance === 0) {
        // there is no dependency or it's the same component (distance zero)
        return;
      }
      const predecessor = dijkstraResults[idStr].predecessor;
      const dependencyType = this.graph.edge(idStr, predecessor);
      dependents.push({
        id: this.graph.node(idStr),
        depth: distance,
        parent: predecessor,
        dependencyType: DEPENDENCIES_TYPES_UI_MAP[dependencyType],
      });
    });
    dependents.sort((a, b) => a.depth - b.depth);
    return dependents;
  }

  _getIdWithLatestVersion(id: BitId): BitId {
    if (id.hasVersion()) {
      return id;
    }
    const nodes = this.graph.nodes();
    const ids = nodes.filter((n) => n.startsWith(id.toString()));
    if (!ids.length) {
      throw new Error(`failed finding ${id.toString()} in the graph`);
    }
    const bitIds = ids.map((idStr) => this.graph.node(idStr));
    return getLatestVersionNumber(BitIds.fromArray(bitIds), id);
  }

  getComponent(id: BitId): ModelComponent {
    return this.graph.node(id.toStringWithoutVersion());
  }

  getImmediateDependentsPerId(id: BitId, returnNodeValue = false): Array<string | Component | BitId> {
    const nodeEdges = this.graph.inEdges(id.toString());
    if (!nodeEdges) return [];
    const idsStr = nodeEdges.map((node) => node.v);
    return returnNodeValue ? idsStr.map((idStr) => this.graph.node(idStr)) : idsStr;
  }

  getImmediateDependenciesPerId(id: BitId): string[] {
    const nodeEdges = this.graph.outEdges(id.toString());
    if (!nodeEdges) return [];
    return nodeEdges.map((node) => node.v);
  }

  serialize(graph: Graph = this.graph) {
    return GraphLib.json.write(graph);
  }
}
