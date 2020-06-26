import { Component } from '../component';
import { WorkspaceExt, Workspace } from '../workspace';
import { DevServerService } from './dev-server.service';
import { Environments } from '../environments';
import { GraphQLExtension } from '../graphql';
import { devServerSchema } from './dev-server.graphql';
import { ComponentServer } from './component-server';

/**
 * bundler extension.
 */
export class BundlerExtension {
  constructor(
    /**
     * workspace extension.
     */
    private workspace: Workspace,

    /**
     * environments extension.
     */
    private envs: Environments,

    /**
     * dev server service.
     */
    private devService: DevServerService
  ) {}

  /**
   * load all given components in corresponding dev servers.
   * @param components defaults to all components in the workspace.
   */
  async devServer(components?: Component[]) {
    const envRuntime = await this.envs.createEnvironment(components || (await this.workspace.list()));
    const executionResponse = await envRuntime.run(this.devService);

    this._componentServers = executionResponse.map(res => res.res);
    this.indexByComponent();
    return this._componentServers;
  }

  /**
   * get a dev server instance containing a component.
   * @param component
   */
  getComponentServer(component: Component): undefined | ComponentServer {
    if (!this._componentServers) return undefined;
    const server = this._componentServers.find(componentServer => componentServer.hasComponent(component));

    return server;
  }

  /**
   * component servers.
   */
  private _componentServers: null | ComponentServer[];

  private indexByComponent() {}

  /**
   * bundle components.
   * @param components defaults to all components in the workspace.
   */
  async bundle(components?: Component[]) {
    return components;
  }

  static dependencies = [WorkspaceExt, Environments, GraphQLExtension];

  static async provider([workspace, envs, graphql]: [Workspace, Environments, GraphQLExtension]) {
    const bundler = new BundlerExtension(workspace, envs, new DevServerService());
    graphql.register(devServerSchema(bundler));
    return bundler;
  }
}
