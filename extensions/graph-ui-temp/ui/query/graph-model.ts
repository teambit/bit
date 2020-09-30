// eslint-disable-next-line max-classes-per-file
import { ComponentModel } from '@teambit/component';
import { EdgeType } from '@teambit/graph';
import { RawGraph, RawNode, RawEdge } from './get-graph.query';

export class GraphModel {
  constructor(public nodes: NodeModel[], public edges: EdgeModel[]) {}
  static from(rawGraph: RawGraph) {
    const nodes = rawGraph.nodes.map(NodeModel.from);
    const edges = rawGraph.edges.map(EdgeModel.from);
    return new GraphModel(nodes, edges);
  }
}

export class NodeModel {
  id: string;
  component: ComponentModel;

  static from(rawNode: RawNode) {
    const node = new NodeModel();
    node.id = rawNode.id;
    // @TODO - component model should not expect all fields to have values
    // @ts-ignore
    node.component = ComponentModel.from(rawNode.component);

    return node;
  }
}

export class EdgeModel {
  sourceId: string;
  targetId: string;
  dependencyLifecycleType: EdgeType;

  static from(rawEdge: RawEdge) {
    const edge = new EdgeModel();
    edge.sourceId = rawEdge.sourceId;
    edge.targetId = rawEdge.targetId;
    edge.dependencyLifecycleType = rawEdge.dependencyLifecycleType;
    return edge;
  }
}
