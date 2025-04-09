/* eslint-disable complexity */
import { PubsubAspect, PubsubMain } from '@teambit/pubsub';
import { MainRuntime } from '@teambit/cli';
import { Component } from '@teambit/component';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { Harmony, Slot, SlotRegistry } from '@teambit/harmony';
import { CompilerAspect, CompilerMain } from '@teambit/compiler';
import { BrowserRuntime } from './browser-runtime';
import { BundlerAspect } from './bundler.aspect';
import { ComponentServer } from './component-server';
import { NewDevServersCreatedEvent } from './events';
import { BundlerContext } from './bundler-context';
import { devServerSchema } from './dev-server.graphql';
import { DevServerService } from './dev-server.service';
import { BundlerService } from './bundler.service';
import { DevServer } from './dev-server';

export type DevServerTransformer = (devServer: DevServer, { envId }: { envId: string }) => DevServer;

export type BrowserRuntimeSlot = SlotRegistry<BrowserRuntime>;
export type DevServerTransformerSlot = SlotRegistry<DevServerTransformer>;

export type BundlerConfig = {
  dedicatedEnvDevServers: string[];
};

/**
 * bundler extension.
 */
export class BundlerMain {
  /**
   * component servers.
   */
  private _componentServers: ComponentServer[] = [];

  constructor(
    readonly config: BundlerConfig,
    /**
     * Pubsub extension.
     */
    private pubsub: PubsubMain,

    /**
     * environments extension.
     */
    private envs: EnvsMain,

    /**
     * dev server service.
     */
    private devService: DevServerService,

    /**
     * browser runtime slot.
     */
    private runtimeSlot: BrowserRuntimeSlot,

    /**
     * dev server transformer slot.
     */
    private devServerTransformerSlot: DevServerTransformerSlot,

    private graphql: GraphqlMain,

    private harmony: Harmony
  ) {
  }
  async addNewDevServers(components: Component[]): Promise<ComponentServer[]> {
    const newComponents = components.filter((component) => {
      return !this.getComponentServer(component);
    });

    if (newComponents.length === 0) {
      return [];
    }

    const compiler = this.harmony.get(CompilerAspect.id) as CompilerMain;
    await compiler.compileOnWorkspace(newComponents.map(c => c.id))

    return this.devServer(newComponents, { configureProxy: true });
  }

  async devServer(components: Component[], opts: { configureProxy?: boolean } = {}): Promise<ComponentServer[]> {
    const envRuntime = await this.envs.createEnvironment(components);
    const servers: ComponentServer[] = await envRuntime.runOnce<ComponentServer>(this.devService, {
      dedicatedEnvDevServers: this.config.dedicatedEnvDevServers,
    });
    if (opts.configureProxy) {
      this.pubsub.pub(BundlerAspect.id, new NewDevServersCreatedEvent(
        servers,
        Date.now(),
        this.graphql,
        true
      ));
    }
    this._componentServers = servers;
    this.indexByComponent();
    return servers;
  }

  /**
   * get a dev server instance containing a component.
   * @param component
   */
  getComponentServer(component: Component): undefined | ComponentServer {
    if (!this._componentServers) return undefined;
    const envId = this.envs.getEnvId(component);
    const server = this._componentServers.find(
      (componentServer) =>
        componentServer.context.relatedContexts.includes(envId) || componentServer.context.id === envId
    );
    return server;
  }

  /**
   * compute entry files for bundling components in a given execution context.
  */
  async computeEntries(context: BundlerContext) {
    const slotEntries = await Promise.all(
      this.runtimeSlot.values().map(async (browserRuntime) => browserRuntime.entry(context))
    );

    const slotPaths = slotEntries.reduce((acc, current) => {
      acc = acc.concat(current);
      return acc;
    });

    return slotPaths;
  }

  /**
   * register a new browser runtime environment.
   * @param browserRuntime
   */
  registerTarget(browserRuntime: BrowserRuntime[]) {
    browserRuntime.map((runtime) => {
      return this.runtimeSlot.register(runtime);
    });

    return this;
  }

  /**
   * register a new dev server transformer.
   * @param devServerTransformer
   */
  registerDevServerTransformer(devServerTransformer: DevServerTransformer) {
    this.devServerTransformerSlot.register(devServerTransformer);
    return this;
  }

  private indexByComponent() { }

  static slots = [Slot.withType<BrowserRuntime>(), Slot.withType<DevServerTransformerSlot>()];

  static runtime = MainRuntime;
  static dependencies = [
    PubsubAspect,
    EnvsAspect,
    GraphqlAspect,
    DependencyResolverAspect,
  ];

  static defaultConfig = {
    dedicatedEnvDevServers: [],
  };

  static async provider(
    [pubsub, envs, graphql, dependencyResolver]:
      [
        PubsubMain,
        EnvsMain,
        GraphqlMain,
        DependencyResolverMain,
      ],
    config,
    [runtimeSlot, devServerTransformerSlot]: [BrowserRuntimeSlot, DevServerTransformerSlot],
    harmony
  ) {

    const devServerService = new DevServerService(pubsub, dependencyResolver, runtimeSlot, devServerTransformerSlot);
    const bundler = new BundlerMain(
      config, pubsub, envs, devServerService, runtimeSlot, devServerTransformerSlot, graphql, harmony);
    envs.registerService(devServerService, new BundlerService());
    graphql.register(() => devServerSchema(bundler, graphql));

    return bundler;
  }
}

BundlerAspect.addRuntime(BundlerMain);
