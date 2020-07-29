import { Slot, SlotRegistry } from '@teambit/harmony';
import { Component, ComponentExtension } from '../component';
import { DevServerService } from './dev-server.service';
import { Environments } from '../environments';
import { GraphQLExtension } from '../graphql';
import { devServerSchema } from './dev-server.graphql';
import { ComponentServer } from './component-server';
import { BrowserRuntime } from './browser-runtime';
import { UIRoot } from '../ui';
import { BundlerContext } from './dev-server-context';

export type BrowserRuntimeSlot = SlotRegistry<BrowserRuntime>;

/**
 * bundler extension.
 */
export class BundlerExtension {
  static id = '@teambit/bundler';

  constructor(
    /**
     * environments extension.
     */
    private envs: Environments,

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
  async devServer(components: Component[], root: UIRoot) {
    const envRuntime = await this.envs.createEnvironment(components);
    this.devService.uiRoot = root;
    const executionResponse = await envRuntime.run(this.devService);

    this._componentServers = executionResponse.map((res) => res.res);
    this.indexByComponent();
    return this._componentServers;
  }

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

  static dependencies = [Environments, GraphQLExtension, ComponentExtension];

  static async provider(
    [envs, graphql]: [Environments, GraphQLExtension],
    config,
    [runtimeSlot]: [BrowserRuntimeSlot]
  ) {
    const bundler = new BundlerExtension(envs, new DevServerService(runtimeSlot), runtimeSlot);

    graphql.register(devServerSchema(bundler));

    return bundler;
  }
}
