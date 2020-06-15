import React from 'react';
import { WorkspaceUI } from '../workspace/workspace.ui';

export class DocsUI {
  static dependencies = [WorkspaceUI];

  static async provider([workspace]: [WorkspaceUI]) {
    workspace.registerMenuItem({
      label: 'Overview',
      onClick: () => workspace.open(<div>Overview!</div>)
    });
    return new DocsUI();
  }
}
