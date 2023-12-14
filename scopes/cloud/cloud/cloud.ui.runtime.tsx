import { UIRuntime } from '@teambit/ui';
import WorkspaceAspect, { WorkspaceUI } from '@teambit/workspace';
import { CurrentUser } from '@teambit/cloud.ui.current-user';
import { CloudAspect } from './cloud.aspect';

export class CloudUI {
  static runtime = UIRuntime;

  static dependencies = [WorkspaceAspect];

  static async provider([workspace]: [WorkspaceUI]) {
    const cloudUI = new CloudUI();
    workspace.registerMenuWidget([CurrentUser]);
    return cloudUI;
  }
}

export default CloudUI;

CloudAspect.addRuntime(CloudUI);
