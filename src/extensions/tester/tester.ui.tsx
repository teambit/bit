import React from 'react';
import { WorkspaceUI } from '../workspace/workspace.ui';

export class TesterUI {
  static dependencies = [WorkspaceUI];

  static async provider([workspace]: [WorkspaceUI]) {
    workspace.registerMenuItem({
      label: 'Tests',
      onClick: () => workspace.open(<div>Tests!</div>)
    });

    return new TesterUI();
  }
}
