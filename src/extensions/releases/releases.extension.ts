import { BitCliExt, BitCli } from '../cli';
import { Environments } from '../environments';
import { WorkspaceExt, Workspace } from '../workspace';
import { ReleaserCmd } from './run.cmd';
import { Component } from '../component';
import { ReleasesService } from './releases.service';
import { BitId } from '../../bit-id';
import { ScopeExtension } from '../scope';
import { Isolator, IsolatorExt } from '../isolator';

/**
 * extension config type.
 */
export type ReleasesConfig = {
  /**
   * number of components to build in parallel.
   */
  parallel: 10;
};

export class ReleasesExtension {
  /**
   * extension dependencies
   */
  static dependencies = [BitCliExt, Environments, WorkspaceExt, ScopeExtension, IsolatorExt];

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
     * release service.
     */
    private service: ReleasesService
  ) {}

  async tagListener(ids: BitId[]) {
    // @todo: some processes needs dependencies/dependents of the given ids
    const components = await this.workspace.getMany(ids);
    return this.release(components);
  }

  /**
   * build given components for release.
   */
  async release(components?: Component[]) {
    const envs = await this.envs.createEnvironment(components);
    const buildResult = await envs.run(this.service);
    return buildResult;
  }

  static async provider([cli, envs, workspace, scope, isolator]: [
    BitCli,
    Environments,
    Workspace,
    ScopeExtension,
    Isolator
  ]) {
    const releasesService = new ReleasesService(isolator, workspace);
    const releases = new ReleasesExtension(envs, workspace, releasesService);
    const func = releases.tagListener.bind(releases);
    if (scope) scope.onTag(func);

    cli.register(new ReleaserCmd(releases, workspace));
    return releases;
  }
}
