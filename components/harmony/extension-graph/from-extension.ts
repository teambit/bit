import { Node, Edge as GraphEdge } from '@teambit/graph.cleargraph';
import { ExtensionManifest, Extension } from '../extension';
import { extensionFactory } from '../factory';
import ExtensionPotentialCircular from '../exceptions/extension-potential-circular';
import { DependencyGraphOptions, Edge } from './extension-graph';

function getName(manifest: any) {
  return Reflect.getMetadata('harmony:name', manifest) || manifest.id || manifest.name;
}

/**
 * build vertices and edges from the given extension
 */
export function fromExtension(extension: ExtensionManifest, options: DependencyGraphOptions = {}) {
  const vertices: { [id: string]: Extension } = {};
  const edges: GraphEdge<Edge>[] = [];

  function iterate(root: ExtensionManifest) {
    const id = options.getName ? options.getName(root) : getName(root);
    if (vertices[id]) return;

    const instance = extensionFactory(root);
    const validDeps = instance.dependencies.filter((dep) => dep).map((dep) => extensionFactory(dep));
    if (instance.dependencies.length > validDeps.length) {
      throw new ExtensionPotentialCircular(instance, validDeps);
    }
    vertices[id] = instance;
    const newEdges = validDeps.map((dep) => {
      return new GraphEdge(id, dep.name, {
        type: 'dependency',
      });
    });

    edges.push(...newEdges);

    // @ts-ignore
    instance.dependencies.forEach((dep) => iterate(dep));
  }

  iterate(extension);

  const vertexArray: Node<Extension>[] = [];
  for (const [key, value] of Object.entries(vertices)) {
    vertexArray.push(new Node(key, value));
  }

  return {
    vertices: vertexArray,
    edges,
  };
}

/**
 * build vertices and edges from the given list of extensions
 */
export function fromExtensions(extensions: ExtensionManifest[], options: DependencyGraphOptions = {}) {
  const perExtension = extensions.map((ext) => fromExtension(ext, options));

  return perExtension.reduce(
    (acc, subgraph) => {
      acc.edges = acc.edges.concat(subgraph.edges);
      acc.vertices = acc.vertices.concat(subgraph.vertices);

      return acc;
    },
    { vertices: [], edges: [] }
  );
}
