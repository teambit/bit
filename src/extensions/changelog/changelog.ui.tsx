import React from 'react';
import { WorkspaceUI } from '../workspace/workspace.ui';

export class ChangeLogUI {
  static dependencies = [WorkspaceUI];

  static ChangeLog = () => {
    return <ChangeLogPage versions={undefined} />;
  };

  static async provider([workspace]: [WorkspaceUI]) {
    const ui = new ChangeLogUI();

    workspace.registerMenuItem({
      label: 'Changelog',
      getContent: this.ChangeLog
    });

    return ui;
  }
}

// @graphqlConnector()
function ChangeLogPage({ versions }: { versions?: string[] }) {
  if (!versions) return <div>No tags yet</div>;

  return (
    <div>
      {versions.map(x => (
        <div key={x}>{x}</div>
      ))}
    </div>
  );
}
