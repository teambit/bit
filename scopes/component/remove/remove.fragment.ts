import { Component, ShowFragment } from '@teambit/component';
import { RemoveMain } from './remove.main.runtime';

export class RemoveFragment implements ShowFragment {
  constructor(private remove: RemoveMain) {}

  title = 'removed';

  async renderRow(component: Component) {
    const removedInfo = await this.remove.getRemoveInfo(component);
    const isRemoved = removedInfo.removed;
    const isRemovedStr = isRemoved.toString();
    const range = removedInfo.range ? ` (range: ${removedInfo.range})` : '';
    const snaps = removedInfo.snaps && removedInfo.snaps.length ? ` (snaps: ${removedInfo.snaps.join(', ')})` : '';

    return {
      title: this.title,
      // when it's not removed, set as an empty string so then it won't be shown in bit-show
      content: isRemoved || range || snaps ? isRemovedStr + range + snaps : '',
    };
  }

  async json(component: Component) {
    return {
      title: this.title,
      json: await this.remove.getRemoveInfo(component),
    };
  }

  weight = 3;
}
