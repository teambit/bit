import type { ShowFragment } from './show-fragment';
import type { Component } from '../component';

export class ScopeFragment implements ShowFragment {
  async renderRow(component: Component) {
    return {
      title: 'scope',
      content: component.id.scope || '',
    };
  }

  getRow() {}

  weight = 1;
}
