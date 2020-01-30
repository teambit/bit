import { ExtensionNode } from './extension-node';
import { ExtensionEdge } from './extension-edge';
import { AnyExtension } from '../types';
/**
 * build vertices and edges from the given extension
 */
export function fromExtension(extension: AnyExtension) {
  const nodes: { [id: string]: ExtensionNode } = {};
  let edges: ExtensionEdge[] = [];
  // extension.

  function iterate(root: AnyExtension) {
    const id = root.name;
    if (nodes[id]) return;

    nodes[id] = new ExtensionNode(id, root);

    const newEdges = root.dependencies.map((dep: AnyExtension) => {
      return new ExtensionEdge(id, dep.name, { type: 'dependency' });
    });

    edges = edges.concat(newEdges);

    root.dependencies.forEach((dep: AnyExtension) => {
      iterate(dep);
    });
  }

  iterate(extension);

  return {
    nodes: Object.values(nodes),
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
      acc.nodes = acc.nodes.concat(subgraph.nodes);

      return acc;
    },
    { nodes: [], edges: [] }
  );
}
