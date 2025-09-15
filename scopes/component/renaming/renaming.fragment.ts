import type { Component, ShowFragment } from '@teambit/component';
import type { RenamingMain } from './renaming.main.runtime';

export class RenamingFragment implements ShowFragment {
  constructor(private renaming: RenamingMain) {}

  title = 'renaming';

  async renderRow(component: Component) {
    const renamingInfo = this.renaming.getRenamingInfo(component);
    const content = renamingInfo ? `origin: ${renamingInfo.renamedFrom.toString()}` : '';
    return {
      title: this.title,
      content,
    };
  }

  async json(component: Component) {
    return {
      title: this.title,
      json: this.renaming.getRenamingInfo(component),
    };
  }

  weight = 3;
}
