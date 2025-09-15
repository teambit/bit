import type { ShowFragment, Component } from '@teambit/component';
import chalk from 'chalk';
import type { EnvsMain } from './environments.main.runtime';

export class EnvFragment implements ShowFragment {
  constructor(private envs: EnvsMain) {}

  readonly title = 'env';

  async renderRow(component: Component) {
    const envId = await this.getEnvId(component);
    const isLoaded = this.envs.isEnvRegistered(envId);
    return {
      title: this.title,
      content: isLoaded ? envId : `${envId} ${chalk.red('(not loaded)')}`,
    };
  }

  async json(component: Component) {
    const envId = await this.getEnvId(component);
    return {
      title: this.title,
      json: envId,
    };
  }

  private async getEnvId(component: Component) {
    // don't use this.envs.getEnv(). otherwise, it'll throw an error when running bit-show on a remote component
    // where the env can't register to the slot.
    // return this.envs.getEnvId(component);
    return (await this.envs.calculateEnvId(component)).toString();
  }

  weight = 3;
}
