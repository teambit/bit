import { flatten } from 'lodash';
import type { PubsubMain } from '@teambit/pubsub';
import { PubsubAspect } from '@teambit/pubsub';
import { MainRuntime } from '@teambit/cli';
import type { Component } from '@teambit/component';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import type { EnvsMain } from '@teambit/envs';
import { EnvsAspect } from '@teambit/envs';
import type { GraphqlMain } from '@teambit/graphql';
import { GraphqlAspect } from '@teambit/graphql';
import type { SlotRegistry } from '@teambit/harmony';
import { Slot } from '@teambit/harmony';
import type { BrowserRuntime } from './browser-runtime';
import { BundlerAspect } from './bundler.aspect';
import type { ComponentServer } from './component-server';
import { NewDevServersCreatedEvent } from './events';
import type { BundlerContext } from './bundler-context';
import { devServerSchema } from './dev-server.graphql';
import type { DevServerFailure, DevServerRunOnceResult } from './dev-server.service';
import { DevServerService } from './dev-server.service';
import { BundlerService } from './bundler.service';
import type { DevServer } from './dev-server';

export type DevServerTransformer = (devServer: DevServer, { envId }: { envId: string }) => DevServer;
export type OnPreDevServerCreated = (newCompsWithoutDevServer: Component[]) => Promise<void>;
export type BrowserRuntimeSlot = SlotRegistry<BrowserRuntime>;
export type DevServerTransformerSlot = SlotRegistry<DevServerTransformer>;
export type OnPreDevServerCreatedSlot = SlotRegistry<OnPreDevServerCreated>;

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

  /**
   * envs that failed to create a dev server on the last `devServer()` call.
   */
  private _devServerFailures: DevServerFailure[] = [];

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

    /**
     * pre-dev-server operation slot.
     */
    private onPreDevServerCreatedSlot: OnPreDevServerCreatedSlot,

    private graphql: GraphqlMain
  ) {}

  async addNewDevServers(newCompsWithoutDevServers: Component[]): Promise<ComponentServer[]> {
    const newComponents = newCompsWithoutDevServers.filter((component) => {
      return !this.getComponentServer(component);
    });

    if (newComponents.length === 0) {
      return [];
    }

    await Promise.all(this.onPreDevServerCreatedSlot.values().map((subscriberFn) => subscriberFn(newComponents)));

    return this.devServer(newComponents, { configureProxy: true });
  }

  async devServer(components: Component[], opts: { configureProxy?: boolean } = {}): Promise<ComponentServer[]> {
    const envRuntime = await this.envs.createEnvironment(components);
    // a failing env no longer rejects the whole batch - it comes back in `failures` instead, so the
    // envs that did build still get their servers. see `DevServerService.runOnce`.
    const { servers, failures }: DevServerRunOnceResult = await envRuntime.runOnce(this.devService, {
      dedicatedEnvDevServers: this.config.dedicatedEnvDevServers,
    });
    this._devServerFailures = failures;
    if (opts.configureProxy) {
      this.pubsub.pub(BundlerAspect.id, new NewDevServersCreatedEvent(servers, Date.now(), this.graphql, true));
    }
    this._componentServers = servers;
    this.indexByComponent();
    return servers;
  }

  /**
   * envs that failed to create a dev server on the last `devServer()` call, with the error that
   * caused it. their components have no preview - everything else is unaffected.
   */
  getDevServerFailures(): DevServerFailure[] {
    return this._devServerFailures;
  }

  /**
   * ids of all envs left without a preview dev server, including the envs that were deduped into a
   * failing env. useful for telling the user (or later, the UI) which components have no preview.
   */
  getEnvIdsWithoutDevServer(): string[] {
    return flatten(this._devServerFailures.map((failure) => [failure.envId, ...failure.relatedEnvIds]));
  }

  /**
   * get a dev server instance containing a component.
   * @param component
   */
  getComponentServer(component: Component): undefined | ComponentServer {
    if (!this._componentServers) return undefined;
    const envId = this.envs.getEnvId(component);
    return this.getComponentServerByEnvId(envId);
  }

  /**
   * get a running dev server by its env id. Matching ignores the version suffix —
   * callers hold ids from different sources (env runtime, execution context,
   * component env) that name the same env with and without a version.
   */
  getComponentServerByEnvId(envId: string): undefined | ComponentServer {
    if (!this._componentServers) return undefined;
    const withoutVersion = (id: string) => id.split('@')[0];
    const exact = this._componentServers.find(
      (componentServer) =>
        componentServer.context.relatedContexts.includes(envId) ||
        componentServer.context.id === envId ||
        componentServer.context.envRuntime.id === envId
    );
    if (exact) return exact;
    const envIdNoVersion = withoutVersion(envId);
    return this._componentServers.find(
      (componentServer) =>
        componentServer.context.relatedContexts.some((related) => withoutVersion(related) === envIdNoVersion) ||
        withoutVersion(componentServer.context.id) === envIdNoVersion ||
        withoutVersion(componentServer.context.envRuntime.id) === envIdNoVersion
    );
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

  /**
   * register a new pre-dev-server compiler.
   * @param onPreDevServerCreated
   */
  registerOnPreDevServerCreated(onPreDevServerCreated: OnPreDevServerCreated) {
    this.onPreDevServerCreatedSlot.register(onPreDevServerCreated);
    return this;
  }

  private indexByComponent() {}

  static slots = [
    Slot.withType<BrowserRuntime>(),
    Slot.withType<DevServerTransformerSlot>(),
    Slot.withType<OnPreDevServerCreatedSlot>(),
  ];

  static runtime = MainRuntime;
  static dependencies = [PubsubAspect, EnvsAspect, GraphqlAspect, DependencyResolverAspect];

  static defaultConfig = {
    dedicatedEnvDevServers: [],
  };

  static async provider(
    [pubsub, envs, graphql, dependencyResolver]: [PubsubMain, EnvsMain, GraphqlMain, DependencyResolverMain],
    config,
    [runtimeSlot, devServerTransformerSlot, onPreDevServerCreatedSlot]: [
      BrowserRuntimeSlot,
      DevServerTransformerSlot,
      OnPreDevServerCreatedSlot,
    ]
  ) {
    const devServerService = new DevServerService(pubsub, dependencyResolver, runtimeSlot, devServerTransformerSlot);
    const bundler = new BundlerMain(
      config,
      pubsub,
      envs,
      devServerService,
      runtimeSlot,
      devServerTransformerSlot,
      onPreDevServerCreatedSlot,
      graphql
    );
    envs.registerService(devServerService, new BundlerService());
    graphql.register(() => devServerSchema(bundler, graphql));

    return bundler;
  }
}

BundlerAspect.addRuntime(BundlerMain);
