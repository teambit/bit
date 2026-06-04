import type { Component, ShowFragment } from '@teambit/component';
import type { InternalizeMain } from './internalize.main.runtime';

export class InternalizeFragment implements ShowFragment {
  constructor(private internalize: InternalizeMain) {}

  title = 'internal';

  async renderRow(component: Component) {
    const { isInternal } = await this.internalize.getInternalInfo(component);
    return {
      title: this.title,
      content: isInternal.toString(),
    };
  }

  async json(component: Component) {
    return {
      title: this.title,
      json: await this.internalize.getInternalInfo(component),
    };
  }

  weight = 3;
}
