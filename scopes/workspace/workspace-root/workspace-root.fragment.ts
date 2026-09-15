import type { Component, ShowFragment } from '@teambit/component';
import type { WorkspaceRootMain } from './workspace-root.main.runtime';

export class WorkspaceRootFragment implements ShowFragment {
  constructor(private workspaceRoot: WorkspaceRootMain) {}

  title = 'workspace root';

  async renderRow(component: Component) {
    return {
      title: this.title,
      content: this.workspaceRoot.getRootOf(component)?.toString() ?? '',
    };
  }

  async json(component: Component) {
    return {
      title: this.title,
      json: this.workspaceRoot.getRootOf(component)?.toString(),
    };
  }
}
