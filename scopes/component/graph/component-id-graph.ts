import { ComponentID } from '@teambit/component';
import { Graph, Node, Edge } from '@teambit/graph.cleargraph';
import { uniq } from 'lodash';

export type DepEdgeType = 'prod' | 'dev' | 'ext';

type ComponentIdNode = Node<ComponentID>;
type DependencyEdge = Edge<DepEdgeType>;
export type CompIdGraph = Graph<ComponentID, DepEdgeType>;

export class ComponentIdGraph extends Graph<ComponentID, DepEdgeType> {
  seederIds: ComponentID[] = []; // component IDs that started the graph. (if from workspace, the .bitmap ids normally)
  constructor(nodes: ComponentIdNode[] = [], edges: DependencyEdge[] = []) {
    super(nodes, edges);
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
    const targetsStr = targets.map((t) => t.toStringWithoutVersion());

    const traverseDFS = (
      node: string,
      visitedInPath: string[],
      visitedInGraph: string[] = [],
      allPaths: string[][]
    ) => {
      if (visitedInPath.includes(node)) return;
      visitedInPath.push(node);
      if (targetsStr.includes(removeVerFromIdStr(node))) {
        allPaths.push(visitedInPath);
        return;
      }
      if (visitedInGraph.includes(node)) return;
      visitedInGraph.push(node);
      const successors = Array.from(this.successorMap(node).values());
      successors.forEach((s) => {
        traverseDFS(s.id, [...visitedInPath], visitedInGraph, allPaths);
      });
    };

    let allPaths: string[][] = [];
    sources.forEach((source) => {
      traverseDFS(source.toString(), [], [], allPaths);
    });

    if (through?.length) {
      allPaths = allPaths.filter((pathWithVer) => {
        const pathWithoutVer = pathWithVer.map((p) => removeVerFromIdStr(p));
        return through.every((t) => pathWithoutVer.includes(t.toStringWithoutVersion()));
      });
    }

    const sourcesStr = sources.map((s) => s.toString());
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

  private shouldLimitToSeedersOnly() {
    return this.seederIds.length;
  }
}
