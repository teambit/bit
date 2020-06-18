import React from 'react';
import { WorkspaceUI } from '../workspace/workspace.ui';

export class TesterUI {
  static dependencies = [WorkspaceUI];

  stageKey?: string;

  constructor(private workspace: WorkspaceUI) {}

  static async provider([workspace]: [WorkspaceUI]) {
    const testerUi = new TesterUI(workspace);

    workspace.registerMenuItem({
      label: 'Tests',
      onClick: testerUi.handleMenuItemClick
    });

    return testerUi;
  }

  handleMenuItemClick = () => {
    const { TestsStage } = this;

    this.workspace.open(<TestsStage />);
  };

  TestsStage = () => {
    return <div>Here be tests results</div>;
  };
}
