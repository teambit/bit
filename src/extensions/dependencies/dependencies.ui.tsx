import React from 'react';
import { WorkspaceUI } from '../workspace/workspace.ui';
import { TopBarNav } from '../workspace/ui/top-bar-nav';
import { DependenciesPage } from './ui/dependencies-page';

export class DependenciesUI {
  static dependencies = [WorkspaceUI];

  static async provider([workspace]: [WorkspaceUI]) {
    workspace.registerMenuItem({
      label: <TopBarNav to="~dependencies">Dependencies</TopBarNav>
    });

    workspace.registerPage({
      path: '~dependencies',
      children: <DependenciesPage />
    });

    return new DependenciesUI();
  }
}
