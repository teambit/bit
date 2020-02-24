import { Graph } from 'cleargraph';
import { AnyExtension } from '../index';
import { fromExtension, fromExtensions } from './from-extension';
import { ExtensionManifest } from '../extension-manifest';

export default class ExtensionGraph extends Graph<AnyExtension, string> {
  private cache = new Map<string, AnyExtension>();

  byExecutionOrder() {
    return this.toposort(true);
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
      this.cache.set(res.name, res);
      return res;
    }

    return null;
  }

  /**
   * build Harmony from a single extension.
   */
  static fromRoot(extension: ExtensionManifest) {
    const { vertices, edges } = fromExtension(extension);
    return new ExtensionGraph(vertices, edges);
  }

  /**
   * build Harmony from set of extensions
   */
  static from(extensions: ExtensionManifest[]) {
    const { vertices, edges } = fromExtensions(extensions);
    return new ExtensionGraph(vertices, edges);
  }
}
