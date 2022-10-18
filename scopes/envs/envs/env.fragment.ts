import { ShowFragment, Component } from '@teambit/component';
import { EnvsMain } from './environments.main.runtime';

export class EnvFragment implements ShowFragment {
  constructor(private envs: EnvsMain) {}

  readonly title = 'env';

  async renderRow(component: Component) {
    return {
      title: this.title,
      content: this.getEnvId(component),
    };
  }

  async json(component: Component) {
    return {
      title: this.title,
      json: this.getEnvId(component),
    };
  }

  private getEnvId(component: Component) {
    // don't use this.envs.getEnv(). otherwise, it'll throw an error when running bit-show on a remote component
    // where the env can't register to the slot.
    return this.envs.getEnvId(component);
  }

  weight = 3;
}
