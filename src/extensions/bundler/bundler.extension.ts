import { Slot, SlotRegistry } from '@teambit/harmony';
import { Component, ComponentExtension } from '../component';
import { DevServerService } from './dev-server.service';
import { Environments } from '../environments';
import { GraphQLExtension } from '../graphql';
import { devServerSchema } from './dev-server.graphql';
import { ComponentServer } from './component-server';
import { BrowserRuntime } from './browser-runtime';
import { UIRoot } from '../ui';

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
   * bundle components.
   * @param components defaults to all components in the workspace.
   */
  async bundle(components?: Component[]) {
    return components;
  }

  /**
   * register a new browser runtime environment.
   * @param browserRuntime
   */
  registerTarget(browserRuntime: BrowserRuntime) {
    this.runtimeSlot.register(browserRuntime);
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
