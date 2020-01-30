import { Vertex, Edge } from 'cleargraph';
import { AnyExtension } from '../types';

/**
 * build vertices and edges from the given extension
 */
export function fromExtension(extension: AnyExtension) {
  const vertices: { [id: string]: Vertex<AnyExtension> } = {};
  let edges: Edge<string>[] = [];

  function iterate(root: AnyExtension) {
    const id = root.name;
    if (vertices[id]) return;

    vertices[id] = new Vertex<AnyExtension>(id, root);

    const newEdges = root.dependencies.map(dep => {
      return Edge.fromObject({
        srcId: id,
        dstId: dep.name,
        attr: 'dependency'
      });
    });

    edges = edges.concat(newEdges);

    // @ts-ignore
    root.dependencies.forEach(dep => iterate(dep));
  }

  iterate(extension);

  return {
    vertices: Object.values(vertices),
    edges
  };
}

/**
 * build vertices and edges from the given list of extensions
 */
export function fromExtensions(extensions: AnyExtension[]) {
  const perExtension = extensions.map(ext => fromExtension(ext));

  return perExtension.reduce(
    (acc, subgraph) => {
      acc.edges = acc.edges.concat(subgraph.edges);
      acc.vertices = acc.vertices.concat(subgraph.vertices);

      return acc;
    },
    { vertices: [], edges: [] }
  );
}
