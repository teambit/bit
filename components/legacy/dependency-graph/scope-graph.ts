import GraphLib, { Graph } from 'graphlib';
import pMapSeries from 'p-map-series';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { VERSION_DELIMITER } from '@teambit/legacy.constants';
import { ComponentsList } from '@teambit/legacy.component-list';
import { ConsumerComponent as Component, DEPENDENCIES_TYPES_UI_MAP } from '@teambit/legacy.consumer-component';
import { getLatestVersionNumber } from '@teambit/legacy.utils';
import { getAllVersionsInfo } from '@teambit/component.snap-distance';
import { Scope, IdNotFoundInGraph } from '@teambit/legacy.scope';
import { ModelComponent, Version } from '@teambit/scope.objects';
import { Workspace } from '@teambit/workspace';

export type DependenciesInfo = {
  id: ComponentID;
  depth: number;
  parent: string;
  dependencyType: string;
};

export class DependencyGraph {
  graph: Graph;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  scopeName: string;

  constructor(graph: Graph) {
    this.graph = graph;
  }

  setScopeName(scopeName: string) {
    this.scopeName = scopeName;
  }

  hasCircular(): boolean {
    return !GraphLib.alg.isAcyclic(this.graph);
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
    // when getting a graph from a remote scope, the class ComponentID is gone and only the object is received
    graph.nodes().forEach((node) => {
      const id = graph.node(node);
      if (!(id instanceof ComponentID)) {
        graph.setNode(node, ComponentID.fromObject(id));
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
            componentVersion.id = component.toComponentId();
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

  static async buildIdsGraphWithAllVersions(scope: Scope): Promise<Graph> {
    const modelComponents = await scope.list();
    const graph = new Graph();
    await pMapSeries(modelComponents, async (modelComp: ModelComponent) => {
      const versionsInfo = await getAllVersionsInfo({
        modelComponent: modelComp,
        repo: scope.objects,
        throws: false,
      });
      versionsInfo.forEach((versionInfo) => {
        if (!versionInfo.version) return;
        const id = modelComp.toComponentId().changeVersion(versionInfo.tag || versionInfo.ref.toString());
        DependencyGraph._addDependenciesToGraph(id, graph, versionInfo.version);
      });
    });

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
        const id = modelComponent.toComponentId().changeVersion(versionNum);
        this._addDependenciesToGraph(id, graph, version);
      });
      await Promise.all(buildVersionP);
    });
    await Promise.all(buildGraphP);
    return graph;
  }

  // originated from legacy graph.ts used only by scopes/dependencies/dependencies/dependents.ts
  // leaving here for now until we make sure it's the same `buildGraphFromScope` of this class

  // static async buildGraphFromScope(scope: Scope): Promise<Graph> {
  //   const graph = new Graph();
  //   const allModelComponents: ModelComponent[] = await scope.list();
  //   await Promise.all(
  //     allModelComponents.map(async (modelComponent) => {
  //       const buildVersionP = modelComponent.listVersionsIncludeOrphaned().map(async (versionNum) => {
  //         const id = modelComponent.toComponentId().changeVersion(versionNum);
  //         const componentVersion = await scope.getConsumerComponentIfExist(id);
  //         if (componentVersion) {
  //           // a component might be in the scope with only the latest version (happens when it's a nested dep)
  //           graph.setNode(componentVersion.id.toString(), componentVersion);
  //         }
  //       });
  //       await Promise.all(buildVersionP);
  //     })
  //   );
  // }

  static async buildGraphFromWorkspace(workspace: Workspace, onlyLatest = false, reverse = false): Promise<Graph> {
    const componentsList = new ComponentsList(workspace);
    const workspaceComponents: Component[] = await componentsList.getFromFileSystem();
    const graph = new Graph();
    const allModelComponents: ModelComponent[] = await workspace.consumer.scope.list();
    const buildGraphP = allModelComponents.map(async (modelComponent) => {
      const latestVersion = modelComponent.getHeadRegardlessOfLaneAsTagOrHash(true);
      const buildVersionP = modelComponent.listVersionsIncludeOrphaned().map(async (versionNum) => {
        if (onlyLatest && latestVersion !== versionNum) return;
        const id = modelComponent.toComponentId().changeVersion(versionNum);
        const componentFromWorkspace = workspaceComponents.find((comp) => comp.id.isEqual(id));
        // if the same component exists in the workspace, use it as it might be modified
        const version =
          componentFromWorkspace ||
          (await modelComponent.loadVersion(versionNum, workspace.consumer.scope.objects, false));
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
   * returns a graph that each node is a ComponentID object.
   */
  static async buildGraphFromCurrentlyUsedComponents(workspace: Workspace): Promise<Graph> {
    const componentsList = new ComponentsList(workspace);
    const workspaceComponents: Component[] = await componentsList.getComponentsFromFS();
    const graph = new Graph();
    workspaceComponents.forEach((component: Component) => {
      const id = component.id;
      this._addDependenciesToGraph(id, graph, component);
    });
    return graph;
  }

  static _addDependenciesToGraph(id: ComponentID, graph: Graph, component: Version | Component, reverse = false): void {
    const idStr = id.toString();
    // save the full ComponentID of a string id to be able to retrieve it later with no confusion
    if (!graph.hasNode(idStr)) graph.setNode(idStr, id);
    // @ts-ignore
    Object.entries(component.depsIdsGroupedByType).forEach(([depType, depIds]: [string, ComponentIdList]) => {
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

  static buildFromNodesAndEdges(
    nodes: Array<{ idStr: string; bitId: ComponentID }>,
    edges: Array<{ src: string; target: string; depType: string }>
  ): Graph {
    const graph = new Graph();
    nodes.forEach((node) => graph.setNode(node.idStr, node.bitId));
    edges.forEach((edge) => graph.setEdge(edge.src, edge.target, edge.depType));

    return graph;
  }

  /**
   * returns a new Graph that has only nodes that are related to the given id.
   * (meaning, they're either dependents or dependencies)
   */
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  getSubGraphOfConnectedComponents(id: ComponentID): Graph {
    const connectedGraphs = GraphLib.alg.components(this.graph);
    const idWithVersion = this._getIdWithLatestVersion(id);
    const graphWithId = connectedGraphs.find((graph) => graph.includes(idWithVersion.toString()));
    if (!graphWithId) {
      throw new Error(`${id.toString()} is missing from the dependency graph`);
    }
    return this.graph.filterNodes((node) => graphWithId.includes(node));
  }

  getDependenciesInfo(id: ComponentID): DependenciesInfo[] {
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

  getDependenciesAsObjectTree(id: string): Record<string, any> {
    const label = id;
    const children = this.graph.outEdges(id);
    if (!children || children.length === 0) {
      return { label };
    }
    const nodes = children.map((child) => this.getDependenciesAsObjectTree(child.w));
    return { label, nodes };
  }

  getDependentsInfo(id: ComponentID): DependenciesInfo[] {
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

  getDependentsForAllVersions(id: ComponentID): ComponentIdList {
    const allBitIds = this.graph.nodes().map((idStr) => this.graph.node(idStr));
    const idWithAllVersions = allBitIds.filter((bitId) => id.isEqualWithoutVersion(bitId));
    const dependentsIds = idWithAllVersions
      .map((idWithVer) => this.getDependentsInfo(idWithVer))
      .flat()
      .map((depInfo) => depInfo.id);
    return ComponentIdList.uniqFromArray(dependentsIds);
  }

  _getIdWithLatestVersion(id: ComponentID): ComponentID {
    if (id.hasVersion()) {
      return id;
    }
    const nodes = this.graph.nodes();
    const ids = nodes.filter((n) => n.startsWith(id.toString()));
    if (!ids.length) {
      throw new IdNotFoundInGraph(id.toString());
    }
    const bitIds = ids.map((idStr) => this.graph.node(idStr));
    return getLatestVersionNumber(ComponentIdList.fromArray(bitIds), id);
  }

  getComponent(id: ComponentID): ModelComponent {
    return this.graph.node(id.toStringWithoutVersion());
  }

  getImmediateDependentsPerId(id: ComponentID, returnNodeValue = false): Array<string | Component | ComponentID> {
    const nodeEdges = this.graph.inEdges(id.toString());
    if (!nodeEdges) return [];
    const idsStr = nodeEdges.map((node) => node.v);
    return returnNodeValue ? idsStr.map((idStr) => this.graph.node(idStr)) : idsStr;
  }

  getImmediateDependenciesPerId(id: ComponentID): string[] {
    const nodeEdges = this.graph.outEdges(id.toString());
    if (!nodeEdges) return [];
    return nodeEdges.map((node) => node.v);
  }

  serialize(graph: Graph = this.graph) {
    return GraphLib.json.write(graph);
  }
}
