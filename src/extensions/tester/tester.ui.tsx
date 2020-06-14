import React from 'react';
import { WorkspaceUI } from '../workspace/workspace.ui';

export class TesterUI {
  static dependencies = [WorkspaceUI];

  static async provider([workspace]: [WorkspaceUI]) {
    workspace.registerMenuItem({
      label: 'Tests',
      getContent: function getContent() {
        return <div>Tests!</div>;
      }
    });

    return new TesterUI();
  }
}
