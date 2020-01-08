import { Toposort, distinct, StrAMethods } from './toposort';
import { Vertex } from './vertex';
import { Edge, RawEdge } from './edge';

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

  topologicallySort(): Vertex<VD>[] {
    const edges = this.edges.map((edge: Edge<ED>) => [edge.srcId, edge.dstId]);

    const ids = distinct(
      // @ts-ignore
      Toposort<string[]>(edges, new StrAMethods())
        .map(node => node[0])
        .reverse()
    );

    // @ts-ignore
    return ids.map(id => this.vertices.find(vertex => vertex.id === id)).filter(_ => _ !== undefined);
    // :TODO performance can be highly optimized in this area
  }

  traverse() {}

  static fromEdges<VD, ED>(rawEdges: RawEdge<ED>[]) {
    const edges = rawEdges.map(rawEdge => Edge.fromObject(rawEdge));
    const vertices = edges
      .flatMap(edge => edge.vertices)
      .map(rawVertex => Vertex.fromObject({ id: rawVertex, attr: {} }));

    return new Graph(edges, vertices);
  }
}
