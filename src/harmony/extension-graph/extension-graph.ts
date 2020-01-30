import { Graph } from 'cleargraph';
import { AnyExtension } from '../types';
import { fromExtension, fromExtensions } from './from-extension';
import { ExtensionEdgeData } from './extension-edge';

export default class ExtensionGraph extends Graph<AnyExtension, ExtensionEdgeData> {
  byExecutionOrder(): AnyExtension[] {
    const extensionsIds = this.toposort().reverse();
    return Object.values(this.getNodeInfo(extensionsIds)) as AnyExtension[];
  }

  addExtensions(extensions: AnyExtension[]) {
    const { nodes, edges } = fromExtensions(extensions);
    this.setNodes(nodes);
    this.setEdges(edges);

    return this;
  }

  getExtension(id: string) {
    return this.node(id);
  }

  static fromRootExtension(extension: AnyExtension) {
    const { nodes, edges } = fromExtension(extension);

    return new ExtensionGraph(true, nodes, edges);
  }

  static from(extensions: AnyExtension[]) {
    const { nodes, edges } = fromExtensions(extensions);
    return new ExtensionGraph(true, nodes, edges);
  }
}
