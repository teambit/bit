import React from 'react';
import { Workspace } from './ui';

export class WorkspaceUI {
  render() {
    return <Workspace />;
  }

  static provider() {
    return new WorkspaceUI();
  }
}
