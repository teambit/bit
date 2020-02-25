import ExtensionGraph from './extension-graph/extension-graph';
import { AnyExtension } from './index';
import { ExtensionLoadError } from './exceptions';
import { ConfigProps, Config } from './config';
import { ExtensionManifest } from './extension-manifest';

// TODO: refactor to generics
async function asyncForEach(array: any, callback: any) {
  // eslint-disable-next-line no-plusplus
  for (let index = 0; index < array.length; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await callback(array[index], index, array);
  }
}

export default class Harmony<ConfProps> {
  constructor(
    /**
     * extension graph
     */
    private graph: ExtensionGraph,

    /**
     * harmony's config
     */
    readonly config: Config<ConfProps>
  ) {}

  private running = false;

  /**
   * list all registered extensions
   */
  get extensions() {
    return this.graph.nodes;
  }

  /**
   * list all registered extensions ids
   */
  get extensionsIds() {
    return [...this.graph.nodes.keys()];
  }

  setExtensionConfig(extensionId: string, config: any) {
    this.config.set(extensionId, config);
  }

  /**
   * set extensions during Harmony runtime.
   */
  async set(extensions: ExtensionManifest[], config: ConfigProps<any>) {
    this.graph.load(extensions);
    const executionOrder = this.graph.byExecutionOrder();
    const newExtensionsNames = extensions.map(ext => ext.name);
    // Filter to include only new extensions
    //@ts-ignore
    const filteredExecutionOrder = executionOrder.filter(ext => newExtensionsNames.includes(ext.name));
    //@ts-ignore
    const filteredExecutionOrderNames = filteredExecutionOrder.map(ext => ext.name);
    filteredExecutionOrderNames.forEach(newExtName => {
      this.config.set(newExtName, config[newExtName]);
    });
    await asyncForEach(filteredExecutionOrder, async (ext: AnyExtension) => {
      await this.runOne(ext);
    });
  }

  private async runOne(extension: AnyExtension) {
    if (extension.loaded) return;
    // create an index of all vertices in dependency graph
    const dependencies = await Promise.all(
      extension.dependencies.map(async dep => {
        return this.graph.getExtension(dep.name)?.instance;
      })
    );

    try {
      await extension.run(dependencies, this, this.config.get(extension.name));
    } catch (err) {
      throw new ExtensionLoadError(extension, err);
    }
  }

  /**
   * get an extension from harmony.
   */
  get(id: string) {
    return this.graph.getExtension(id);
  }

  /**
   * execute harmony. applies providers of all extensions by execution order.
   */
  async run() {
    // :TODO refactor to an exception
    if (this.running) return;
    this.running = true;
    const executionOrder = this.graph.byExecutionOrder();
    await asyncForEach(executionOrder, async (ext: AnyExtension) => {
      await this.runOne(ext);
    });

    this.running = false;
  }

  /**
   * load harmony from a root extensions
   */
  static load<Conf>(extensions: ExtensionManifest[], config: ConfigProps<Conf>) {
    const graph = ExtensionGraph.from(extensions);
    return new Harmony(graph, new Config(config));
  }

  /**
   * load all extensions and execute harmony.
   */
  static async run<Conf>(extension: ExtensionManifest, config: ConfigProps<Conf>) {
    const graph = ExtensionGraph.fromRoot(extension);
    const harmony = new Harmony<Conf>(graph, new Config(config));
    await harmony.run();
    return harmony;
  }
}
