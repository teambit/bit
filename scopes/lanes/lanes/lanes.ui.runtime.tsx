import React from 'react';
import { UIRuntime } from '@teambit/ui';
import { LanesAspect } from '@teambit/lanes';
import SidebarAspect, { SidebarUI } from '@teambit/sidebar';
import WorkspaceAspect, { WorkspaceUI } from '@teambit/workspace';
import { LanesDrawer } from './drawer/lanes-drawer';
export class LanesUI {
  static dependencies = [WorkspaceAspect, SidebarAspect];

  static runtime = UIRuntime;

  constructor(private workspaceUI: WorkspaceUI, private sidebar: SidebarUI) {}

  static async provider([workspaceUI, sidebar]: [WorkspaceUI, SidebarUI]) {
    // eslint-disable-next-line react/display-name
    sidebar.registerDrawer(new LanesDrawer());
    // workspaceUI.registerSidebarWidget(componentTreeNode);
    const lanesUi = new LanesUI(workspaceUI, sidebar);
    return lanesUi;
  }
}

export default LanesUI;

LanesAspect.addRuntime(LanesUI);
