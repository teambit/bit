import React from 'react';
import { UIRuntime } from '@teambit/ui';
import WorkspaceAspect, { WorkspaceUI } from '@teambit/workspace';
import { CloudAspect } from './cloud.aspect';
import { CurrentUser } from './ui/current-user/current-user';

export class CloudUI {
  static runtime = UIRuntime;

  static dependencies = [WorkspaceAspect];

  static async provider([workspace]: [WorkspaceUI]) {
    const cloudUI = new CloudUI();
    workspace.registerMenuWidget([CurrentUser]);
    return cloudUI;
  }

  //   constructor() {}
}

export default CloudUI;

CloudAspect.addRuntime(CloudUI);
