import 'reflect-metadata';
import pMapSeries from 'p-map-series';
import ExtensionGraph, { DependencyGraphOptions } from './extension-graph/extension-graph';
import { ExtensionLoadError } from './exceptions';
import { Extension, ExtensionManifest } from './extension';
import { Config } from './config';
import { Aspect } from './aspect';
import { Runtimes } from './runtimes/runtimes';
import { RuntimeDefinition } from './runtimes/runtime-definition';
import { RuntimeNotDefined } from './runtimes/exceptions';

export type GlobalConfig = {
  [key: string]: object;
};

export type RequireFn = (aspect: Extension, runtime: RuntimeDefinition) => Promise<void>;

export class Harmony {
  constructor(
    /**
     * extension graph
     */
    readonly graph: ExtensionGraph,

    /**
     * harmony top level config
     */
    readonly config: Config,

    readonly runtimes: Runtimes,

    readonly activeRuntime: string,

    private depOptions: DependencyGraphOptions
  ) {}

  public current: string | null = null;

  private runtime: RuntimeDefinition | undefined;

  /**
   * list all registered extensions
   */
  get extensions(): Map<string, Extension> {
    const extensionsNodes = this.graph.nodeMap;
    const extensions = new Map();
    for (const [id, ext] of extensionsNodes) {
      extensions.set(id, ext.attr);
    }
    return extensions;
  }

  /**
   * list all registered extensions ids
   */
  get extensionsIds() {
    return [...this.graph.nodeMap.keys()];
  }

  /**
   * load an Aspect into the dependency graph.
   */
  async load(extensions: ExtensionManifest[]) {
    return this.set(extensions);
  }

  /**
   * set extensions during Harmony runtime.
   * hack!
   */
  async set(extensions: ExtensionManifest[]) {
    this.graph.load(extensions);
    // Only load new extensions and their dependencies
    const extensionsToLoad = extensions.map((ext) => {
      // @ts-ignore
      return Reflect.getMetadata('harmony:name', ext) || ext.id || ext.name;
    });

    // @ts-ignore
    await this.graph.enrichRuntime(this.runtime, this.runtimes, () => {});
    // @ts-ignore
    const subgraphs = this.graph.successorsSubgraph(extensionsToLoad);
    if (subgraphs) {
      const executionOrderNodes = subgraphs.toposort(true);
      const executionOrder = executionOrderNodes.map((n) => n.attr);
      await pMapSeries(executionOrder, async (ext: Extension) => {
        if (!this.runtime) throw new RuntimeNotDefined(this.activeRuntime);
        await this.runOne(ext, this.runtime);
      });
    }
  }

  private async runOne(extension: Extension, runtime: RuntimeDefinition) {
    if (extension.loaded) return;
    // create an index of all vertices in dependency graph
    const deps = this.graph.getRuntimeDependencies(extension, runtime, this.depOptions);
    const instances = deps.map((ext) => ext.instance);
    console.log('deps', deps.length, 'instances', instances);

    try {
      // eslint-disable-next-line consistent-return
      return extension.__run(instances, this, runtime);
    } catch (err: any) {
      throw new ExtensionLoadError(extension, err);
    }
  }

  getDependencies(aspect: Extension) {
    if (!this.runtime) throw new RuntimeNotDefined(this.activeRuntime);
    return this.graph.getRuntimeDependencies(aspect, this.runtime, this.depOptions);
  }

  initExtension(id: string) {
    this.current = id;
  }

  endExtension() {
    this.current = null;
  }

  /**
   * get an extension from harmony.
   */
  get<T>(id: string): T {
    const extension = this.graph.get(id);
    if (!extension || !extension.instance) throw new Error(`failed loading extension ${id}`);
    return extension.instance;
  }

  resolveRuntime(name: string): RuntimeDefinition {
    return this.runtimes.get(name);
  }

  async run(requireFn?: RequireFn) {
    const runtime = this.resolveRuntime(this.activeRuntime);
    this.runtime = runtime;
    const defaultRequireFn: RequireFn = async (aspect: Extension, runtime: RuntimeDefinition) => {
      const runtimeFile = runtime.getRuntimeFile(aspect.files);
      // eslint-disable-next-line no-useless-return
      if (!runtimeFile) return;
      // runtime.require(runtimeFile);
    };
    // requireFn ? await requireFn(aspect, runtime) : defaultRequireFn(this.graph);
    await this.graph.enrichRuntime(runtime, this.runtimes, requireFn || defaultRequireFn, this.depOptions);

    const executionOrder = this.graph.byExecutionOrder().map((e) => e.attr);
    await pMapSeries(executionOrder, async (ext: Extension) => {
      console.log('! run ', ext.id);
      await this.runOne(ext, runtime);
    });
  }

  static async load(
    aspects: Aspect[],
    runtime: string,
    globalConfig: GlobalConfig,
    options: DependencyGraphOptions = {}
  ) {
    const aspectGraph = ExtensionGraph.from(aspects as any, options);
    const runtimes = await Runtimes.load(aspectGraph);
    return new Harmony(aspectGraph, Config.from(globalConfig), runtimes, runtime, options);
  }
}
