import type { ShowFragment } from './show-fragment';
import type { Component } from '../component';

export class MainFileFragment implements ShowFragment {
  async renderRow(component: Component) {
    return {
      title: 'main file',
      content: component.state._consumer.mainFile,
    };
  }

  weight = 4;
}
