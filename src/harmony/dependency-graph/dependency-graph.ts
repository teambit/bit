import { Graph, VertexId, Vertex, Edge } from '../../graph';
import { AnyExtension } from '../types';

export default class DependencyGraph extends Graph<AnyExtension, string> {
  private cache = new Map<string, Vertex<AnyExtension>>();

  byExecutionOrder() {
    return this.topologicallySort().map(vertex => vertex.attr);
  }

  // :TODO refactor this asap
  getExtension(id: string) {
    const cachedVertex = this.cache.get(id);
    if (cachedVertex) return cachedVertex;

    const res = this.vertices.find(vertex => vertex.id === id);
    if (res) {
      this.cache.set(res.id, res.attr);
      return res.attr;
    }

    return null;
  }

  static fromRoot(extension: AnyExtension) {
    const vertices: { [id: string]: Vertex<AnyExtension> } = {};
    let edges: Edge<string>[] = [];
    // extension.

    function iterate(root: AnyExtension) {
      const id = root.name;
      if (vertices[id]) return;

      vertices[id] = new Vertex<AnyExtension>(id, root);

      const newEdges = root.dependencies.map((dep: AnyExtension) => {
        return Edge.fromObject({
          srcId: id,
          dstId: dep.name,
          attr: 'dependency'
        });
      });

      edges = edges.concat(newEdges);

      root.dependencies.forEach((dep: AnyExtension) => {
        iterate(dep);
      });
    }

    iterate(extension);

    return new DependencyGraph(edges, Object.values(vertices));
  }
}
