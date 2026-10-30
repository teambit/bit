import type { Component, ShowFragment } from '@teambit/component';
import type { WorkspaceRootMain } from './workspace-root.main.runtime';

export class WorkspaceRootFragment implements ShowFragment {
  constructor(private workspaceRoot: WorkspaceRootMain) {}

  title = 'workspace root';

  async renderRow(component: Component) {
    return {
      title: this.title,
      content: this.workspaceRoot.isWorkspaceRootComponent(component)
        ? 'this component'
        : (this.workspaceRoot.getRootOf(component)?.toString() ?? ''),
    };
  }

  async json(component: Component) {
    const isRoot = this.workspaceRoot.isWorkspaceRootComponent(component);
    const root = this.workspaceRoot.getRootOf(component)?.toString();
    return {
      title: this.title,
      json: isRoot ? { isRoot } : root ? { root } : undefined,
    };
  }
}
