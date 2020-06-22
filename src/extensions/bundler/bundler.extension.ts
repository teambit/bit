import { Component } from '../component';
import { WorkspaceExt, Workspace } from '../workspace';
import { DevServerService } from './dev-server.service';
import { Environments } from '../environments';

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
    const server = await envRuntime.run(this.devService);
    return server;
  }

  /**
   * bundle components.
   * @param components defaults to all components in the workspace.
   */
  async bundle(components?: Component[]) {
    return components;
  }

  static dependencies = [WorkspaceExt, Environments];

  static async provider([workspace, envs]: [Workspace, Environments]) {
    return new BundlerExtension(workspace, envs, new DevServerService());
  }
}
