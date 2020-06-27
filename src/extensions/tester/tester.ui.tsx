import React from 'react';
import { WorkspaceUI } from '../workspace/workspace.ui';
import { TopBarNav } from '../component/ui/top-bar-nav';
import { TestsPage } from './ui/tests-page';

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
      path: '~tests',
      children: <TestsPage />
    });

    return testerUi;
  }
}
