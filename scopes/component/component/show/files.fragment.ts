import type { ShowFragment } from './show-fragment';
import type { Component } from '../component';

export class FilesFragment implements ShowFragment {
  async renderRow(component: Component) {
    return {
      title: 'files',
      content: this.getRelativePaths(component).join('\n'),
    };
  }

  async json(component: Component) {
    return {
      title: 'files',
      json: this.getRelativePaths(component),
    };
  }

  private getRelativePaths(component: Component) {
    return component.state.filesystem.files.map((file) => file.relative);
  }

  weight = 4;
}
