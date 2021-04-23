import { Component, ShowFragment } from '@teambit/component';
import { DeprecationMain } from './deprecation.main.runtime';

export class DeprecationFragment implements ShowFragment {
  constructor(private deprecation: DeprecationMain) {}

  title = 'deprecated';

  async renderRow(component: Component) {
    return {
      title: this.title,
      content: this.deprecation.getDeprecationInfo(component).isDeprecate.toString(),
    };
  }

  async json(component: Component) {
    return {
      title: this.title,
      json: this.deprecation.getDeprecationInfo(component),
    };
  }

  weight = 3;
}
