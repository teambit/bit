import type { ShowFragment } from './show-fragment';
import type { Component } from '../component';

export class ExtensionsFragment implements ShowFragment {
  private renderList(component: Component) {
    const aspects = component.state.aspects.entries.map((entry) => entry.id.toString());
    return aspects.sort().join('\n');
  }

  async renderRow(component: Component) {
    return {
      title: 'aspects',
      content: this.renderList(component),
    };
  }

  async json(component: Component) {
    return {
      title: 'configuration',
      json: component.state.aspects.serialize() as any,
    };
  }
}
