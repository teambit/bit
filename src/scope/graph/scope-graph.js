/** @flow */
import GraphLib from 'graphlib';
import { BitId } from '../../bit-id';
import type { ModelComponent, Version } from '../models';
import { VERSION_DELIMITER } from '../../constants';
import Scope from '../scope';
import { DEPENDENCIES_TYPES, DEPENDENCIES_TYPES_UI_MAP } from '../../consumer/component/dependencies/dependencies';
import Component from '../../consumer/component/consumer-component';

const Graph = GraphLib.Graph;

export type DependenciesInfo = {
  id: BitId,
  depth: number,
  parent: string,
  dependencyType: string
};

export default class DependencyGraph {
  graph: Graph;

  constructor(graph: Object) {
    this.graph = graph;
  }

  static async loadAllVersions(scope: Scope): Promise<DependencyGraph> {
    const graph = await DependencyGraph.buildGraphWithAllVersions(scope);
    return new DependencyGraph(graph);
  }

  static async loadLatest(scope: Scope): Promise<DependencyGraph> {
    const graph = await DependencyGraph.buildGraphOfLatestFromScope(scope);
    return new DependencyGraph(graph);
  }

  static loadFromString(str: string): DependencyGraph {
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

  static async buildGraphWithAllVersions(scope: Scope): Graph {
    const graph = new Graph({ compound: true });
    const depObj: { [id: string]: Version } = {};
    // $FlowFixMe
    const allComponents = await scope.list();
    // build all nodes. a node is either a Version object or Component object.
    // each Version node has a parent of Component node. Component node doesn't have a parent.
    await Promise.all(
      allComponents.map(async (component) => {
        graph.setNode(component.id(), component);
        await Promise.all(
          Object.keys(component.versions).map(async (version) => {
            const componentVersion = await component.loadVersion(version, scope.objects);
            if (!componentVersion) return;
            const idWithVersion = `${component.id()}${VERSION_DELIMITER}${version}`;
            graph.setNode(idWithVersion, componentVersion);
            graph.setParent(idWithVersion, component.id());
            componentVersion.id = component.toBitId();
            depObj[idWithVersion] = componentVersion;
          })
        );
      })
    );
    // set all edges
    // @todo: currently the label is "require". Change it to be "direct" and "indirect" depends on whether it comes from
    // flattenedDependencies or from dependencies.
    Object.keys(depObj).forEach(id =>
      depObj[id].flattenedDependencies.forEach(dep => graph.setEdge(id, dep.toString(), 'require'))
    );
    return graph;
  }

  static async buildGraphOfLatestFromScope(scope: Scope): Promise<Graph> {
    const graph = new Graph();
    const allModelComponents: ModelComponent[] = await scope.list();
    const buildGraphP = allModelComponents.map(async (modelComponent) => {
      // $FlowFixMe
      const latestVersion = await modelComponent.loadVersion(modelComponent.latest(), scope.objects);
      const id = modelComponent.toBitIdWithLatestVersion();
      const idStr = id.toString();
      // save the full BitId of a string id to be able to retrieve it later with no confusion
      if (!graph.hasNode(idStr)) graph.setNode(idStr, id);
      DEPENDENCIES_TYPES.forEach((depType) => {
        latestVersion[depType].get().forEach((dependency) => {
          const depIdStr = dependency.id.toString();
          if (!graph.hasNode(depIdStr)) graph.setNode(depIdStr, dependency.id);
          graph.setEdge(idStr, depIdStr, depType);
        });
      });
    });
    await Promise.all(buildGraphP);
    return graph;
  }

  static buildGraphFromComponents(components: Component[]): Graph {
    const graph = new Graph();
    components.forEach((component: Component) => {
      const id = component.id;
      const idStr = component.id.toString();
      // save the full BitId of a string id to be able to retrieve it later with no confusion
      if (!graph.hasNode(idStr)) graph.setNode(idStr, id);
      DEPENDENCIES_TYPES.forEach((depType) => {
        // $FlowFixMe
        component[depType].get().forEach((dependency) => {
          const depIdStr = dependency.id.toString();
          if (!graph.hasNode(depIdStr)) graph.setNode(depIdStr, dependency.id);
          graph.setEdge(idStr, depIdStr, depType);
        });
      });
    });
    return graph;
  }

  /**
   * returns a new Graph that has only nodes that are related to the given id.
   * (meaning, they're either dependents or dependencies)
   */
  getSubGraphOfConnectedComponents(id: BitId): Graph {
    const connectedGraphs = GraphLib.alg.components(this.graph);
    const graphWithId = connectedGraphs.find(graph => graph.includes(id.toString()));
    if (!graphWithId) {
      throw new Error(`${id.toString()} is missing from the dependency graph`);
    }
    return this.graph.filterNodes(node => graphWithId.includes(node));
  }

  getDependenciesInfo(id: BitId): DependenciesInfo[] {
    const dijkstraResults = GraphLib.alg.dijkstra(this.graph, id.toString());
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
        dependencyType: DEPENDENCIES_TYPES_UI_MAP[dependencyType]
      });
    });
    dependencies.sort((a, b) => a.depth - b.depth);
    return dependencies;
  }

  getDependentsInfo(id: BitId): DependenciesInfo[] {
    const edgeFunc = v => this.graph.inEdges(v);
    const dijkstraResults = GraphLib.alg.dijkstra(this.graph, id.toString(), undefined, edgeFunc);
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
        dependencyType: DEPENDENCIES_TYPES_UI_MAP[dependencyType]
      });
    });
    dependents.sort((a, b) => a.depth - b.depth);
    return dependents;
  }

  getComponent(id: BitId): ModelComponent {
    return this.graph.node(id.toStringWithoutVersion());
  }

  getDependentsPerId(id: BitId): string[] {
    const nodeEdges = this.graph.inEdges(id.toString());
    if (!nodeEdges) return [];
    return nodeEdges.map(node => node.v);
  }

  getDependenciesPerId(id: BitId): string[] {
    const nodeEdges = this.graph.outEdges(id.toString());
    if (!nodeEdges) return [];
    return nodeEdges.map(node => node.v);
  }

  serialize(graph: ?Object = this.graph) {
    return GraphLib.json.write(graph);
  }
}
