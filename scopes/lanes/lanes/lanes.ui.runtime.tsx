import { UIRuntime } from '@teambit/ui';
import { LanesAspect } from '@teambit/lanes';
import WorkspaceAspect, { WorkspaceUI } from '@teambit/workspace';
import { LanesDrawer } from '@teambit/lanes.lanes.ui';
import ScopeAspect, { ScopeUI } from '@teambit/scope';
import { SidebarAspect, SidebarUI } from '@teambit/sidebar';

export class LanesUI {
  static dependencies = [WorkspaceAspect, ScopeAspect, SidebarAspect];

  static runtime = UIRuntime;

  constructor(private workspaceUI: WorkspaceUI, private scopeUI: ScopeUI, private sidebarUI: SidebarUI) {}

  static async provider([workspaceUI, scopeUI, sidebarUI]: [WorkspaceUI, ScopeUI, SidebarUI]) {
    sidebarUI.registerDrawer(new LanesDrawer());
    const lanesUi = new LanesUI(workspaceUI, scopeUI, sidebarUI);
    return lanesUi;
  }
}

export default LanesUI;

LanesAspect.addRuntime(LanesUI);
