import { Component, ShowFragment } from '@teambit/component';
import { ForkingMain } from './forking.main.runtime';

export class ForkingFragment implements ShowFragment {
  constructor(private forking: ForkingMain) {}

  title = 'forking';

  async renderRow(component: Component) {
    const forkingInfo = this.forking.getForkInfo(component);
    const content = forkingInfo ? `origin: ${forkingInfo.forkedFrom.toString()}` : '';
    return {
      title: this.title,
      content,
    };
  }

  async json(component: Component) {
    return {
      title: this.title,
      json: this.forking.getForkInfo(component),
    };
  }

  weight = 3;
}
