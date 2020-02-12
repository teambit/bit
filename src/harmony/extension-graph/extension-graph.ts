import { Graph } from 'cleargraph';
import { AnyExtension } from '../index';
import { fromExtension, fromExtensions } from './from-extension';
import { ExtensionManifest } from '../extension-manifest';

export default class DependencyGraph extends Graph<AnyExtension, string> {
  private cache = new Map<string, AnyExtension>();

  byExecutionOrder() {
    return this.toposort().map(vertex => vertex.attr);
  }

  load(extensions: ExtensionManifest[]) {
    const { vertices, edges } = fromExtensions(extensions);
    this.setNodes(vertices);
    this.setEdges(edges);

    return this;
  }

  // :TODO refactor this asap
  getExtension(id: string) {
    const cachedVertex = this.cache.get(id);
    if (cachedVertex) return cachedVertex;

    const res = this.node(id);
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

    return new DependencyGraph(vertices, edges);
  }

  /**
   * build Harmony from set of extensions
   */
  static from(extensions: ExtensionManifest[]) {
    const { vertices, edges } = fromExtensions(extensions);

    return new DependencyGraph(vertices, edges);
  }
}
