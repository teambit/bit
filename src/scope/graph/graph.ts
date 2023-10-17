import graphlib, { Graph as GraphLib } from 'graphlib';
import R from 'ramda';
import { ComponentID } from '@teambit/component-id';
import Component from '../../consumer/component';
import { loadScope } from '../index';
import { ModelComponent } from '../models';
import Scope from '../scope';

export default class Graph extends GraphLib {
  getSuccessorsByEdgeTypeRecursively(
    bitId: string,
    successorsList: string[] = [],
    visited: { [key: string]: boolean } = {}
  ): string[] {
    const successors = this.successors(bitId) || [];
    if (successors.length > 0 && !visited[bitId]) {
      successors.forEach((successor) => {
        visited[bitId] = true;
        successorsList.push(successor);

        return this.getSuccessorsByEdgeTypeRecursively(successor, successorsList, visited);
      });
    }
    return successorsList;
  }

  /**
   * e.g. a graph has edges of "dependencies" and "devDependencies" and you want a new graph of the
   * dependencies only.
   */
  getSubGraphByEdgeType(edgeType: string): Graph {
    const newGraph = new Graph();
    newGraph.setNodes(this.nodes());
    this.edges().forEach((edge) => {
      const edgeLabel = this.edge(edge);
      if (edgeLabel === edgeType) {
        newGraph.setEdge(edge.v, edge.w, edgeType);
      }
    });

    return newGraph;
  }

  findSuccessorsInGraph(ids: string[]): Component[] {
    const dependenciesFromAllIds = R.flatten(ids.map((id) => this.getSuccessorsByEdgeTypeRecursively(id)));
    const components: Component[] = R.uniq([...dependenciesFromAllIds, ...ids])
      .map((id: string) => this.node(id))
      .filter((val) => val);
    return components;
  }

  /**
   * helps finding the versions of bit-ids using the components stored in the graph
   */
  public getBitIdsIncludeVersionsFromGraph(ids: ComponentID[], graph: Graph): ComponentID[] {
    const components: Component[] = graph.nodes().map((n) => graph.node(n));
    return ids.map((id) => {
      const component =
        components.find((c) => c.id.isEqual(id)) || components.find((c) => c.id.isEqualWithoutVersion(id));
      if (!component) throw new Error(`unable to find ${id.toString()} in the graph`);
      return component.id;
    });
  }

  toString() {
    return graphlib.json.write(this);
  }

  toGraphOfIds() {
    const graph = new Graph();

    this.nodes().forEach((node) => graph.setNode(node, node));
    this.edges().forEach((edge) => graph.setEdge(edge.v, edge.w, undefined, edge.name));
    return graph;
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  static async buildGraphFromScope(scope: Scope): Promise<Graph> {
    const graph = new Graph();
    const allModelComponents: ModelComponent[] = await scope.list();
    await this.addScopeComponentsAsNodes(allModelComponents, graph);
  }

  static async addScopeComponentsAsNodes(
    allModelComponents: ModelComponent[],
    graph: Graph,
    workspaceComponents?: Component[],
    onlyLatest = false
  ) {
    const scope = await loadScope(process.cwd());
    await Promise.all(
      allModelComponents.map(async (modelComponent) => {
        const latestVersion = modelComponent.getHeadRegardlessOfLaneAsTagOrHash(true);
        const buildVersionP = modelComponent.listVersionsIncludeOrphaned().map(async (versionNum) => {
          if (onlyLatest && latestVersion !== versionNum) return;
          const id = modelComponent.toComponentId().changeVersion(versionNum);
          const componentFromWorkspace = workspaceComponents
            ? workspaceComponents.find((comp) => comp.id.isEqual(id))
            : undefined;
          if (!componentFromWorkspace) {
            const componentVersion = await scope.getConsumerComponentIfExist(id);
            if (componentVersion) {
              // a component might be in the scope with only the latest version (happens when it's a nested dep)
              graph.setNode(componentVersion.id.toString(), componentVersion);
            }
          }
        });
        await Promise.all(buildVersionP);
      })
    );
  }

  findCycles(): string[][] {
    return graphlib.alg.findCycles(this);
  }
}
