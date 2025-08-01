import type { ShowFragment } from './show-fragment';
import type { Component } from '../component';

export class IDFragment implements ShowFragment {
  async renderRow(component: Component) {
    const isModified = await component.isModified();
    const modifiedStr = isModified ? ' [modified]' : '';
    return {
      title: 'id',
      content: `${component.id.toString()}${modifiedStr}`,
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
