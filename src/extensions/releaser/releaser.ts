import { Environments, Environment } from '../environments';
import { Workspace } from '../workspace';
import { Component } from '../component';
import { EnvRuntime } from '../environments/runtime';
import { BitId } from '../../bit-id';

export interface Release {
  onRelease(context: ReleaseContext): Promise<any>;
}

type ReleaseContext = {
  components: Component[];
  env: Environment;
};

export class Releaser {
  constructor(private envs: Environments, private workspace: Workspace) {
    const func = this.processDuringTag.bind(this);
    if (this.workspace?.scope?.onTag) this.workspace.scope.onTag.push(func);
  }

  async processDuringTag(ids: BitId[]) {
    // @todo: some processes needs dependencies/dependents of the given ids
    const components = await this.workspace.getMany(ids);
    return this.release(components);
  }

  async release(components?: Component[]) {
    const envs = await this.envs.createEnvironment(components);
    const results = await Promise.all(
      envs.runtimeEnvs.map(async runtimeEnv => {
        const concreteReleasers: Release[] = runtimeEnv.env.release();
        return this.runRelease(concreteReleasers, runtimeEnv);
      })
    );
    return results;
  }

  private async runRelease(concreteReleasers: Release[], runtimeEnv: EnvRuntime) {
    const resultsP = concreteReleasers.map(concreteReleaser => {
      if (!concreteReleaser.onRelease) {
        throw new Error('releaser.runRelease expects concreteReleaser to implement onRelease()');
      }
      return concreteReleaser.onRelease({ components: runtimeEnv.components, env: runtimeEnv.env });
    });
    return { id: runtimeEnv.id, results: await Promise.all(resultsP) };
  }
}
