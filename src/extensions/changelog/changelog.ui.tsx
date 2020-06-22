import React from 'react';
import { WorkspaceUI } from '../workspace/workspace.ui';
import { TopBarNav } from '../workspace/ui/top-bar-nav';

import { versionsArray } from './changelog.data';
import { VersionBlock } from '../stage-components/workspace-sections/version-block';
import { Version } from '../stage-components/workspace-page/change-log.data';

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
      path: '/~changelog',
      children: ui.ChangeLog()
    });

    return ui;
  }
}

// @graphqlConnector()
function ChangeLogPage({ versions }: { versions?: Version[] }) {
  if (!versions) return <div>No tags yet</div>;

  return (
    <div>
      {versions.map((version, index) => (
        <VersionBlock key={index} version={version} />
      ))}
    </div>
  );
}
