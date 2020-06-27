import React from 'react';
import { WorkspaceUI } from '../workspace/workspace.ui';
import { DocsSection } from '../stage-components/workspace-sections/docs-section';
import { TopBarNav } from '../workspace/ui/top-bar-nav';
import { docsMock } from './docs.data';
import { Overview } from './overview';

export class DocsUI {
  static dependencies = [WorkspaceUI];

  static async provider([workspace]: [WorkspaceUI]) {
    workspace.registerMenuItem({
      label: <TopBarNav to="~overview">Overview</TopBarNav>
    });

    workspace.registerPage({
      path: ['~overview', ''],
      exact: true,
      children: <Overview />
    });

    return new DocsUI();
  }
}
