import { VertexId } from './vertex';

/**
 * A single directed edge consisting of a source id, target id,
 * and the data associated with the edge.
 *
 * @tparam ED type of the edge attribute
 *
 * @param srcId The vertex id of the source vertex
 * @param dstId The vertex id of the target vertex
 * @param attr The attribute associated with the edge
 */
export class Edge<ED> {
  constructor(readonly srcId: VertexId, readonly dstId: VertexId, readonly attr: ED) {}

  get vertices() {
    return [this.srcId, this.dstId];
  }

  static fromObject<ED>(object: RawEdge<ED>) {
    return new Edge(object.srcId, object.dstId, object.attr);
  }
}

export type RawEdge<ED> = {
  srcId: VertexId;
  dstId: VertexId;
  attr: ED;
};
