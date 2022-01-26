import { UIRuntime } from '@teambit/ui';
import { LanesAspect } from '@teambit/lanes';
import { LanesDrawer } from '@teambit/lanes.lanes.ui';
import { SidebarAspect, SidebarUI } from '@teambit/sidebar';
import { DrawerType } from '@teambit/ui-foundation.ui.tree.drawer';

export class LanesUI {
  static dependencies = [SidebarAspect];

  static runtime = UIRuntime;

  constructor(private sidebarUI: SidebarUI) {}

  registerDrawer(drawers: DrawerType) {
    this.sidebarUI.registerDrawer(drawers);
    return this;
  }

  static async provider([sidebarUI]: [SidebarUI]) {
    const lanesUi = new LanesUI(sidebarUI);
    lanesUi.registerDrawer(new LanesDrawer());
    return lanesUi;
  }
}

export default LanesUI;

LanesAspect.addRuntime(LanesUI);
