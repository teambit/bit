import { AnyExtension } from '../index';
import { ExtensionManifest } from '../extension-manifest';
import { extensionFactory } from '../factory';
import ExtensionPotentialCircular from '../exceptions/extension-potential-circular';

/**
 * build vertices and edges from the given extension
 */
export function fromExtension(extension: ExtensionManifest) {
  const vertices: { [id: string]: AnyExtension } = {};
  let edges: { sourceId: string; targetId: string; edge: string }[] = [];

  function iterate(root: ExtensionManifest) {
    const id = root.name;
    if (vertices[id]) return;

    const instance = extensionFactory(root);
    const validDeps = instance.dependencies.filter(dep => dep).map(dep => dep.name);
    if (instance.dependencies.length > validDeps.length) {
      throw new ExtensionPotentialCircular(instance, validDeps);
    }
    vertices[id] = new AnyExtension(instance);
    const newEdges = instance.dependencies.map(dep => {
      return {
        sourceId: id,
        targetId: dep.name,
        edge: 'dependency'
      };
    });
    edges = edges.concat(newEdges);

    // @ts-ignore
    instance.dependencies.forEach(dep => iterate(dep));
  }

  iterate(extension);

  let vertexArray: { id: string; node: AnyExtension }[] = [];
  for (let [key, value] of Object.entries(vertices)) {
    vertexArray.push({ id: key, node: value });
  }
  return {
    vertices: vertexArray, // : Object.values(vertices),
    edges
  };
}

/**
 * build vertices and edges from the given list of extensions
 */
export function fromExtensions(extensions: ExtensionManifest[]) {
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
