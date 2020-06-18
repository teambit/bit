import { Component } from '../component';
import { WorkspaceExt, Workspace } from '../workspace';

/**
 * bundler extension.
 */
export class BundlerExtension {
  constructor(
    /**
     * workspace extension.
     */
    private workspace: Workspace
  ) {}

  /**
   * load all given components in corresponding dev servers.
   * @param components defaults to all components in the workspace.
   */
  async devServer(components?: Component[]) {}

  /**
   * bundle components.
   * @param components defaults to all components in the workspace.
   */
  async bundle(components?: Component[]) {}

  static dependencies = [WorkspaceExt];

  static async provider([workspace]: [Workspace]) {
    return new BundlerExtension(workspace);
  }
}
