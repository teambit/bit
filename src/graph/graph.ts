import { has } from 'lodash';
import { Toposort, distinct, StrAMethods } from './toposort';
import { Vertex, VertexId } from './vertex';
import { Edge, RawEdge } from './edge';

has();
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
  constructor(readonly edges: Edge<ED>[], readonly vertices: Vertex<VD>[]) {
    this.vertices.forEach(vertex => this.setVertex(vertex));
    this.edges.forEach(edge => this.setVertex(edge));
  }

  private _vertices = new Map<VertexId, Vertex<VD>>();
  private _edges = new Map<string, Edge<ED>>();

  /**
   * set a vertex on the graph.
   */
  setVertex(vertex: Vertex<VD>): Graph<VD, ED> {
    if (this._vertices[vertex.id]) return this;
    this._vertices[vertex.id] = vertex;
    return this;
  }

  /**
   * set an edge on the graph.
   */
  setEdge(edge: Edge<ED>): Graph<VD, ED> {
    if (this._edges[edge.id]) return this;
    this.edges[edge.id] = edge;
    return this;
  }

  /**
   * set multiple edges on the graph.
   */
  setEdges(edges: Edge<ED>[]) {
    edges.forEach(edge => this.setEdge(edge));
    return this;
  }

  /**
   * set multiple vertices on the graph.
   */
  setVertices(vertices: Vertex<VD>[]) {
    vertices.forEach(vertex => this.setVertex(vertex));
    return this;
  }

  /**
   * topologically sort the graph as an array.
   */
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

  /**
   * determines whether a vertex exists on the graph.
   */
  hasVertex(vertex: Vertex<VD>) {
    return !!this._vertices[vertex.id];
  }

  /**
   * determine whether an edge exists on the graph.
   */
  hasEdge(edge: Edge<ED>) {
    return !!this._edges[edge.id];
  }

  traverse() {}

  /**
   * build graph from an array of edges.
   */
  static fromEdges<VD, ED>(rawEdges: RawEdge<ED>[]) {
    const edges = rawEdges.map(rawEdge => Edge.fromObject(rawEdge));
    const vertices = edges
      .flatMap(edge => edge.vertices)
      .map(rawVertex => Vertex.fromObject({ id: rawVertex, attr: {} }));

    return new Graph(edges, vertices);
  }
}
