import { UIRuntime } from '@teambit/ui';
import { LanesAspect } from '@teambit/lanes';
import WorkspaceAspect, { WorkspaceUI } from '@teambit/workspace';
import { LanesDrawer } from '@teambit/lanes.lanes.ui';
import ScopeAspect, { ScopeUI } from '@teambit/scope';

export class LanesUI {
  static dependencies = [WorkspaceAspect, ScopeAspect];

  static runtime = UIRuntime;

  constructor(private workspaceUI: WorkspaceUI, private scopeUI: ScopeUI) {}

  static async provider([workspaceUI, scopeUI]: [WorkspaceUI, ScopeUI]) {
    workspaceUI.registerDrawer(new LanesDrawer(true));
    // scopeUI.registerDrawer(new LanesDrawer(false));
    const lanesUi = new LanesUI(workspaceUI, scopeUI);
    return lanesUi;
  }
}

export default LanesUI;

LanesAspect.addRuntime(LanesUI);
