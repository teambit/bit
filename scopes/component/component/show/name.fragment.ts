import { ShowFragment } from './show-fragment';
import { Component } from '../component';

export class NameFragment implements ShowFragment {
  async renderRow(component: Component) {
    return {
      title: 'name',
      content: component.id.fullName,
    };
  }

  weight = 2;
}
