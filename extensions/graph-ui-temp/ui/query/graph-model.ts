import { RawGraph, RawNode, RawEdge } from './get-graph.query';
import { ComponentID } from '@teambit/component';

export class GraphModel {
  constructor(public nodes: NodeModel[], public edges: EdgeModel[]) {}
  static from(rawGraph: RawGraph) {
    const nodes = rawGraph.nodes.map(NodeModel.from);
    const edges = rawGraph.edges.map(EdgeModel.from);
    return new GraphModel(nodes, edges);
  }
}

class NodeModel {
  id: string;
  component: {
    id: ComponentID;
  };

  static from(rawNode: RawNode) {
    var node = new NodeModel();
    node.id = rawNode.id;
    node.component = {
      id: ComponentID.fromObject(rawNode.component.id),
    };
    return node;
  }
}

class EdgeModel {
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
