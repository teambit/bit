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
    const env = this.envs.getEnv(component);
    return env.id;
  }

  weight = 3;
}
