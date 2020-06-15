import { Environments } from '../environments';
import { WorkspaceExt, Workspace } from '../workspace';
import { BuilderCmd } from './run.cmd';
import { Component } from '../component';
import { BuilderService } from './builder.service';
import { BitId } from '../../bit-id';
import { ScopeExtension } from '../scope';
import { IsolatorExtension } from '../isolator';
import { CLIExtension } from '../cli';

/**
 * extension config type.
 */
export type BuilderConfig = {
  /**
   * number of components to build in parallel.
   */
  parallel: 10;
};

export class BuilderExtension {
  static id = '@teambit/builder';
  /**
   * extension dependencies
   */
  static dependencies = [CLIExtension, Environments, WorkspaceExt, ScopeExtension, IsolatorExtension];

  constructor(
    /**
     * environments extension.
     */
    private envs: Environments,

    /**
     * workspace extension.
     */
    private workspace: Workspace,

    /**
     * builder service.
     */
    private service: BuilderService
  ) {}

  async tagListener(ids: BitId[]) {
    // @todo: some processes needs dependencies/dependents of the given ids
    const components = await this.workspace.getMany(ids);
    return this.build(components);
  }

  /**
   * build given components for release.
   */
  async build(components?: Component[]) {
    const envs = await this.envs.createEnvironment(components);
    const buildResult = await envs.run(this.service);
    return buildResult;
  }

  static async provider([cli, envs, workspace, scope, isolator]: [
    CLIExtension,
    Environments,
    Workspace,
    ScopeExtension,
    IsolatorExtension
  ]) {
    const builderService = new BuilderService(isolator, workspace);
    const builder = new BuilderExtension(envs, workspace, builderService);
    const func = builder.tagListener.bind(builder);
    if (scope) scope.onTag(func);

    cli.register(new BuilderCmd(builder, workspace));
    return builder;
  }
}
