import { Component, ShowFragment } from '@teambit/component';
import { DeprecationMain } from './deprecation.main.runtime';

export class DeprecationFragment implements ShowFragment {
  constructor(private deprecation: DeprecationMain) {}

  title = 'deprecated';

  async renderRow(component: Component) {
    const deprecationInfo = await this.deprecation.getDeprecationInfo(component);
    const isDeprecate = deprecationInfo.isDeprecate.toString();
    const newId = deprecationInfo.newId ? ` (new-id: ${deprecationInfo.newId})` : '';
    return {
      title: this.title,
      content: isDeprecate + newId,
    };
  }

  async json(component: Component) {
    return {
      title: this.title,
      json: await this.deprecation.getDeprecationInfo(component),
    };
  }

  weight = 3;
}
