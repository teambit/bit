import { ComponentID } from '@teambit/component-id';
import { Graph, Node, Edge } from '@teambit/graph.cleargraph';
import type { DependenciesInfo } from '@teambit/legacy.dependency-graph';
import GraphLib from 'graphlib';
import { uniq } from 'lodash';

export type DepEdgeType = 'prod' | 'dev' | 'ext' | 'peer';

type ComponentIdNode = Node<ComponentID>;
type DependencyEdge = Edge<DepEdgeType>;
export type CompIdGraph = Graph<ComponentID, DepEdgeType>;

export class ComponentIdGraph extends Graph<ComponentID, DepEdgeType> {
  private _graphLib: GraphLib.Graph;
  seederIds: ComponentID[] = []; // component IDs that started the graph. (if from workspace, the .bitmap ids normally)
  constructor(nodes: ComponentIdNode[] = [], edges: DependencyEdge[] = []) {
    super(nodes, edges);
  }

  get graphLib() {
    if (!this._graphLib) {
      // convert clearGraph to graphLib
      this._graphLib = new GraphLib.Graph();
      this.nodes.forEach((node) => {
        this._graphLib.setNode(node.id.toString());
      });
      this.edges.forEach((edge) => {
        this._graphLib.setEdge(edge.sourceId.toString(), edge.targetId.toString(), edge.attr);
      });
    }
    return this._graphLib;
  }

  protected create(nodes: ComponentIdNode[] = [], edges: DependencyEdge[] = []): this {
    return new ComponentIdGraph(nodes, edges) as this;
  }

  /**
   * check all the routes from the sources to targets and return the components found during this traversal.
   * e.g.
   * A -> B -> C -> N.
   * A -> E -> N.
   * B -> F -> G.
   * given source: A, targets: N. The results will be: [B, C, E].
   *
   * if through is provided, it will only return the components that are connected to the through components.
   * with the example above, if through is B, the results will be: [B, C].
   */
  findIdsFromSourcesToTargets(sources: ComponentID[], targets: ComponentID[], through?: ComponentID[]): ComponentID[] {
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
    const componentIds = this.getNodes(results).map((n) => n.attr);

    if (!through?.length) {
      return componentIds;
    }

    const resultsWithThrough: ComponentID[] = [];
    const throughStr = through.map((t) => t.toStringWithoutVersion());
    componentIds.forEach((id) => {
      const allGraph = this.subgraph(id.toString()).nodes.map((n) => n.id); // successors and predecessors
      const allGraphWithNoVersion = allGraph.map((s) => removeVerFromIdStr(s));
      if (throughStr.every((t) => allGraphWithNoVersion.includes(t))) resultsWithThrough.push(id);
    });

    return resultsWithThrough;
  }

  /**
   * check all the routes from the sources to targets and return the components found during this traversal.
   * e.g.
   * A -> B -> C -> N.
   * A -> E -> N.
   * B -> F -> G.
   * given source: A, targets: N. The results will be: [B, C, E].
   *
   * if through is provided, it will only return the components that are connected to the through components.
   * with the example above, if through is B, the results will be: [B, C].
   */
  findAllPathsFromSourcesToTargets(
    sources: ComponentID[],
    targets: ComponentID[],
    through?: ComponentID[]
  ): string[][] {
    const removeVerFromIdStr = (idStr: string) => idStr.split('@')[0];

    const findAllPathsBFS = (start: string[], end: string[]): string[][] => {
      const paths: string[][] = [];
      const visited = new Set<string>();
      const queue: { node: string; path: string[] }[] = [];
      start.forEach((s) => queue.push({ node: s, path: [s] }));
      while (queue.length) {
        const { node, path } = queue.shift()!;
        if (end.includes(removeVerFromIdStr(node))) {
          paths.push([...path]);
        } else {
          visited.add(node);
          const successors = this.outEdges(node).map((e) => e.targetId);
          for (const successor of successors) {
            if (!visited.has(successor)) {
              queue.push({ node: successor, path: [...path, successor] });
            }
          }
        }
      }
      return paths;
    };

    const targetsStr = targets.map((t) => t.toStringWithoutVersion());
    const sourcesStr = sources.map((s) => s.toString());

    let allPaths = findAllPathsBFS(sourcesStr, targetsStr);

    if (through?.length) {
      allPaths = allPaths.filter((pathWithVer) => {
        const pathWithoutVer = pathWithVer.map((p) => removeVerFromIdStr(p));
        return through.every((t) => pathWithoutVer.includes(t.toStringWithoutVersion()));
      });
    }

    const filtered = allPaths.filter((path) => {
      if (path.length < 3) {
        // if length is 1, the source and target are the same.
        // if length is 2, the target is a direct dependency of the source. we don't care about it.
        return false;
      }
      const [, firstDep] = path;
      if (sourcesStr.includes(firstDep)) {
        // the first item is the source. the second item "firstDep" can be a direct dependency of one of the sources.
        // if this is the case, we have already an exact path without this firstDep.
        return true;
      }
      return true;
    });

    return filtered.sort((a, b) => a.length - b.length);
  }

  /**
   * overrides the super class to eliminate non-seeders components
   */
  findCycles(graph?: this, includeDeps = false): string[][] {
    const cycles = super.findCycles(graph);
    // reverse the order to show a more intuitive cycle order. from the dependent to the dependency.
    cycles.forEach((cycle) => cycle.reverse());
    if (!this.shouldLimitToSeedersOnly() || includeDeps) {
      return cycles;
    }
    const seederIdsStr = this.seederIds.map((id) => id.toString());
    const cyclesWithSeeders = cycles.filter((cycle) => {
      return cycle.some((cycleIdStr) => seederIdsStr.includes(cycleIdStr));
    });
    return cyclesWithSeeders;
  }

  buildFromCleargraph(graph: Graph<ComponentID, DepEdgeType>): ComponentIdGraph {
    return this.create(graph.nodes, graph.edges);
  }

  runtimeOnly(componentIds: string[]) {
    return this.successorsSubgraph(componentIds, {
      edgeFilter: (edge: DependencyEdge) => edge.attr === 'prod',
    });
  }

  getDependenciesInfo(id: ComponentID): DependenciesInfo[] {
    const dijkstraResults = GraphLib.alg.dijkstra(this.graphLib, id.toString());
    const dependencies: DependenciesInfo[] = [];
    Object.keys(dijkstraResults).forEach((idStr) => {
      const distance = dijkstraResults[idStr].distance;
      if (distance === Infinity || distance === 0) {
        // there is no dependency or it's the same component (distance zero)
        return;
      }
      const predecessor = dijkstraResults[idStr].predecessor;
      const dependencyType = this.edge(predecessor, idStr);
      dependencies.push({
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        id: this.node(idStr)!.attr,
        depth: distance,
        parent: predecessor,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        dependencyType: dependencyType!.attr,
      });
    });
    dependencies.sort((a, b) => a.depth - b.depth);
    return dependencies;
  }

  getDependenciesAsObjectTree(idStr: string): Record<string, any> {
    const depsInfo = this.getDependenciesInfo(ComponentID.fromString(idStr));
    const populateTreeItems = (id: string, treeItems: Array<{ label: string; nodes?: Array<Record<string, any>> }>) => {
      const children = depsInfo.filter((depInfo) => depInfo.parent === id);
      if (!children || children.length === 0) {
        return;
      }
      children.forEach((child) => {
        const { id: compId } = child;
        const label = compId.toString();
        const currentNodes = [];
        treeItems.push({ label, nodes: currentNodes });
        populateTreeItems(label, currentNodes);
      });
    };

    const currentNodes = [];
    const tree = { label: idStr, nodes: currentNodes };
    populateTreeItems(idStr, currentNodes);
    return tree;
  }

  private shouldLimitToSeedersOnly() {
    return this.seederIds.length;
  }
}
