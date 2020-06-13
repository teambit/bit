import React from 'react';

export class WorkspaceUI {
  render() {
    return <div>hi from workspace extension</div>;
  }

  static provider() {
    return new WorkspaceUI();
  }
}
