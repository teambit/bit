import React from 'react';
import { WorkspaceUI } from '../workspace/workspace.ui';
import { TopBarNav } from '../workspace/ui/top-bar-nav';

export class TesterUI {
  static dependencies = [WorkspaceUI];

  stageKey?: string;

  constructor(private workspace: WorkspaceUI) {}

  static async provider([workspace]: [WorkspaceUI]) {
    const testerUi = new TesterUI(workspace);

    workspace.registerMenuItem({
      label: <TopBarNav to="~tests">Tests</TopBarNav>
    });

    workspace.registerPage({
      path: '/~tests',
      children: <TestsPage />
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

function TestsPage() {
  return <div>here be tests</div>;
}
