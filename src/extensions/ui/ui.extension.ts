import { CLIExtension } from '../cli';
import { StartCmd } from './start.cmd';
import { Environments } from '../environments';
import { Workspace, WorkspaceExt } from '../workspace';
import { GraphQLExtension } from '../graphql';
import { Component } from '../component';

export class UIExtension {
  static dependencies = [CLIExtension, Environments, WorkspaceExt, GraphQLExtension];

  constructor(
    /**
     * envs extension.
     */
    private envs: Environments,

    /**
     * graphql extension.
     */
    private graphql: GraphQLExtension
  ) {}

  async createRuntime(components?: Component[]) {
    const server = this.graphql.listen();
  }

  static async provider([cli, envs, workspace, graphql]: [CLIExtension, Environments, Workspace, GraphQLExtension]) {
    const ui = new UIExtension(envs, graphql);
    cli.register(new StartCmd(ui, workspace));
    return ui;
  }
}
