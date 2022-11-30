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
    const componentIds = this.getNodes(results).map((n) => n.attr);

    return componentIds;
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
