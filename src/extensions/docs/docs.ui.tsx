import { WorkspaceUI } from '../workspace/workspace.ui';

export class DocsUI {
  static dependencies = [WorkspaceUI];

  static async provider([workspace]: [WorkspaceUI]) {
    workspace.registerMenuItem({
      label: 'Overview',
      onClick: () => {}
    });
    return new DocsUI();
  }
}
