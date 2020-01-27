import { Graph } from 'cleargraph';
import { AnyExtension } from '../types';
import { fromExtension, fromExtensions } from './from-extension';

export default class ExtensionGraph extends Graph<AnyExtension, string> {
  // private cache = new Map<string, AnyExtension>();

  byExecutionOrder(): AnyExtension[] {
    const extensionsIds = this.toposort().reverse();
    return Object.values(this.getNodeInfo(extensionsIds));
  }

  addExtensions(extensions: AnyExtension[]) {
    const { nodes, edges } = fromExtensions(extensions);
    this.setNodes(nodes);
    this.setEdges(edges);

    return this;
  }

  // :TODO refactor this asap
  getExtension(id: string) {
    // const cachedVertex = this.cache.get(id);
    // if (cachedVertex) return cachedVertex;

    // const res = this.vertices.find(vertex => vertex.id === id);
    // if (res) {
    //   this.cache.set(res.id, res.attr);
    //   return res.attr;
    // }

    // return null;
    return this.node(id);
  }

  static fromRootExtension(extension: AnyExtension) {
    const { nodes, edges } = fromExtension(extension);

    return new ExtensionGraph(true, false, nodes, edges);
  }

  static from(extensions: AnyExtension[]) {
    const { nodes, edges } = fromExtensions(extensions);
    return new ExtensionGraph(true, false, nodes, edges);
  }
}
