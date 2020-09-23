import { RawGraph, RawNode, RawEdge } from './get-graph.query';
import { ComponentModel } from '@teambit/component';

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
    var node = new NodeModel();
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
  dependencyLifecycleType: string;

  static from(rawEdge: RawEdge) {
    var edge = new EdgeModel();
    edge.sourceId = rawEdge.sourceId;
    edge.targetId = rawEdge.targetId;
    edge.dependencyLifecycleType = rawEdge.dependencyLifecycleType;
    return edge;
  }
}
