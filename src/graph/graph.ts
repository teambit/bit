import { Toposort, distinct, StrAMethods } from './toposort';
import { Vertex } from './vertex';
import Edge, { RawEdge } from './edge';

/**
 * The Graph abstractly represents a graph with arbitrary objects
 * associated with vertices and edges.  The graph provides basic
 * operations to access and manipulate the data associated with
 * vertices and edges as well as the underlying structure.
 *
 * @tparam VD the vertex attribute type
 * @tparam ED the edge attribute type
 */
export default class Graph<VD, ED> {
  constructor(readonly edges: Edge<ED>[], readonly vertices: Vertex<VD>[]) {}

  topologicallySort() {
    const edges = this.edges.map((edge: Edge<string>) => [edge.srcId, edge.dstId]);

    const ids = distinct(
      // @ts-ignore
      Toposort<string[]>(edges, new StrAMethods())
        .map(node => node[0])
        .reverse()
    );

    // :TODO performance can be highly optimized in this area
    return ids.map(id => {
      return this.vertices.find(vertex => vertex.id === id);
    });
  }

  traverse() {}

  static fromEdges<VD, ED>(rawEdges: RawEdge<ED>[]) {
    const edges = rawEdges.map(rawEdge => Edge.fromObject(rawEdge));
    const vertices = edges.flatMap(edge => edge.vertices);

    return new Graph(edges, vertices);
  }
}
