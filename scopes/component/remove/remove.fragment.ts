import { Component, ShowFragment } from '@teambit/component';
import { RemoveMain } from './remove.main.runtime';

export class RemoveFragment implements ShowFragment {
  constructor(private remove: RemoveMain) {}

  title = 'removed';

  async renderRow(component: Component) {
    const isRemoved = this.remove.isRemoved(component);
    return {
      title: this.title,
      // when it's not removed, set as an empty string so then it won't be shown in bit-show
      content: isRemoved ? isRemoved.toString() : '',
    };
  }

  async json(component: Component) {
    return {
      title: this.title,
      json: this.remove.getRemoveInfo(component),
    };
  }

  weight = 3;
}
