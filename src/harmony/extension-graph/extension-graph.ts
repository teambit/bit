import { Graph } from 'cleargraph';
import { AnyExtension } from '../types';
import { fromExtension, fromExtensions } from './from-extension';
import { ExtensionManifest } from '../extension-manifest';

export default class DependencyGraph extends Graph<AnyExtension, string> {
  private cache = new Map<string, AnyExtension>();

  byExecutionOrder() {
    return this.topologicallySort().map(vertex => vertex.attr);
  }

  load(extensions: ExtensionManifest[]) {
    const { vertices, edges } = fromExtensions(extensions);
    this.setVertices(vertices);
    this.setEdges(edges);

    return this;
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

  /**
   * build Harmony from a single extension.
   */
  static fromRoot(extension: ExtensionManifest) {
    const { vertices, edges } = fromExtension(extension);

    return new DependencyGraph(edges, vertices);
  }

  /**
   * build Harmony from set of extensions
   */
  static from(extensions: ExtensionManifest[]) {
    const { vertices, edges } = fromExtensions(extensions);

    return new DependencyGraph(edges, vertices);
  }
}
