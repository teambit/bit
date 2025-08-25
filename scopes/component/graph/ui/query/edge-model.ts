import type { EdgeType } from '../../edge-type';
import type { RawEdge } from './get-graph.query';

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
