import React from 'react';
import { WorkspaceUI } from '../workspace/workspace.ui';
import { TopBarNav } from '../workspace/ui/top-bar-nav';

import { versionsArray } from './ui/changelog.data';
import { ChangeLogPage } from './ui/change-log-page';

export class ChangeLogUI {
  static dependencies = [WorkspaceUI];

  ChangeLog = () => {
    return <ChangeLogPage versions={versionsArray} />;
  };

  static async provider([workspace]: [WorkspaceUI]) {
    const ui = new ChangeLogUI();

    workspace.registerMenuItem({
      label: <TopBarNav to="~changelog">Changelog</TopBarNav>
    });

    workspace.registerPage({
      path: '~changelog',
      children: ui.ChangeLog()
    });

    return ui;
  }
}
