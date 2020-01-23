import Extension from './extension';
import ExtensionGraph from './extension-graph/extension-graph';
import { AnyExtension } from './types';
import { ExtensionLoadError } from './exceptions';

async function asyncForEach(array, callback) {
  // eslint-disable-next-line no-plusplus
  for (let index = 0; index < array.length; index++) {
    // eslint-disable-next-line no-await-in-loop
    await callback(array[index], index, array);
  }
}

export default class Harmony {
  constructor(private graph: ExtensionGraph) {}

  get extensions() {
    return Object.values(this.graph.getNodeInfo(this.graph.nodes()));
  }

  async load(extensions: AnyExtension[]) {
    this.graph.addExtensions(extensions);
    asyncForEach(extensions, async ext => this.runOne(ext));
  }

  async runOne(extension: AnyExtension) {
    if (extension.instance) return;
    // create an index of all vertices in dependency graph
    const dependencies = await Promise.all(
      extension.dependencies.map(async (ext: AnyExtension) => {
        return ext.instance;
      })
    );

    try {
      await extension.run(dependencies, this);
    } catch (err) {
      throw new ExtensionLoadError(extension, err);
    }
  }

  async run() {
    const executionOrder = this.graph.byExecutionOrder();
    await asyncForEach(executionOrder, async ext => {
      await this.runOne(ext);
    });
  }

  static load(extension: Extension<any, any>) {
    const graph = ExtensionGraph.fromRootExtension(extension);
    return new Harmony(graph);
  }
}
