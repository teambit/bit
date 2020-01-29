import Extension from './extension';
import ExtensionGraph from './extension-graph/extension-graph';
import { AnyExtension } from './types';
import { ExtensionLoadError } from './exceptions';
import logger from '../logger/logger';
import defaultHandleError from '../cli/default-error-handler';

// TODO: refactor to generics
async function asyncForEach(array: any, callback: any) {
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
      logger.error(
        `failed to load extension: ${extension.name} with error: ${err.stack}. Error serialized: ${JSON.stringify(
          err,
          Object.getOwnPropertyNames(err)
        )}`
      );
      const msg = defaultHandleError(err);
      throw new ExtensionLoadError(extension, err, msg);
    }
  }

  /**
   * execute harmony.
   */
  async run() {
    const executionOrder = this.graph.byExecutionOrder();
    await asyncForEach(executionOrder, async (ext: Extension) => {
      await this.runOne(ext);
    });
  }

  /**
   * load harmony from a root extension
   */
  static load(extensions: Extension<any, any>[]) {
    const graph = ExtensionGraph.from(extensions);
    return new Harmony(graph);
  }
}
