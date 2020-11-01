import PubsubAspect, { PubsubMain } from '@teambit/pubsub';
import { MainRuntime } from '@teambit/cli';
import { Component, ComponentAspect } from '@teambit/component';
import { EnvsAspect, EnvsMain } from '@teambit/environments';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { UIRoot } from '@teambit/ui';

import { BrowserRuntime } from './browser-runtime';
import { BundlerAspect } from './bundler.aspect';
import { ComponentServer } from './component-server';
import { BundlerContext } from './dev-server-context';
import { devServerSchema } from './dev-server.graphql';
import { DevServerService } from './dev-server.service';

export type BrowserRuntimeSlot = SlotRegistry<BrowserRuntime>;

/**
 * bundler extension.
 */
export class BundlerMain {
  constructor(
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
    private runtimeSlot: BrowserRuntimeSlot
  ) {}

  /**
   * load all given components in corresponding dev servers.
   * @param components defaults to all components in the workspace.
   */
  async devServer(components: Component[], root: UIRoot): Promise<ComponentServer[]> {
    const envRuntime = await this.envs.createEnvironment(components);
    this.devService.uiRoot = root;
    const executionResults = await envRuntime.run<ComponentServer>(this.devService);

    this._componentServers = executionResults.results.map((res) => res.data as ComponentServer);

    this.indexByComponent();
    return this._componentServers;
  }

  getPublicPath() {}

  /**
   * get a dev server instance containing a component.
   * @param component
   */
  getComponentServer(component: Component): undefined | ComponentServer {
    if (!this._componentServers) return undefined;
    const server = this._componentServers.find((componentServer) => componentServer.hasComponent(component));

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
   * component servers.
   */
  private _componentServers: null | ComponentServer[];

  private indexByComponent() {}

  static slots = [Slot.withType<BrowserRuntime>()];

  static runtime = MainRuntime;
  static dependencies = [PubsubAspect, EnvsAspect, GraphqlAspect, ComponentAspect];

  static async provider(
    [pubsub, envs, graphql]: [PubsubMain, EnvsMain, GraphqlMain],
    config,
    [runtimeSlot]: [BrowserRuntimeSlot]
  ) {
    const bundler = new BundlerMain(pubsub, envs, new DevServerService(pubsub, runtimeSlot), runtimeSlot);

    graphql.register(devServerSchema(bundler));

    return bundler;
  }
}

BundlerAspect.addRuntime(BundlerMain);
