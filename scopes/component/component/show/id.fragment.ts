import { ShowFragment } from './show-fragment';
import { Component } from '../component';

export class IDFragment implements ShowFragment {
  async renderRow(component: Component) {
    return {
      title: 'id',
      content: component.id.toString(),
    };
  }

  async json(component: Component) {
    return {
      title: 'id',
      json: component.id.toString(),
    };
  }

  weight = 0;
}
