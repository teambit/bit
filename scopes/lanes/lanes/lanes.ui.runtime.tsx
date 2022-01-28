import { UIRuntime } from '@teambit/ui';
import { LanesAspect } from '@teambit/lanes';
import { LanesDrawer } from '@teambit/lanes.lanes.ui';
import { SidebarAspect, SidebarUI } from '@teambit/sidebar';
import { DrawerType } from '@teambit/ui-foundation.ui.tree.drawer';
import { RouteProps } from 'react-router-dom';
import { Slot } from '@teambit/harmony';
import { RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';

export class LanesUI {
  static dependencies = [SidebarAspect];
  static runtime = UIRuntime;
  static slots = [Slot.withType<RouteProps>()];

  constructor(private sidebarUI: SidebarUI, private routeSlot: RouteSlot, private drawer: DrawerType) {
    this.registerDrawer(drawer);
  }

  registerDrawer(drawers: DrawerType) {
    this.sidebarUI.registerDrawer(drawers);
    return this;
  }

  static async provider([sidebarUI]: [SidebarUI], config, [routeSlot]: [RouteSlot]) {
    const lanesUi = new LanesUI(sidebarUI, routeSlot, new LanesDrawer());
    return lanesUi;
  }
}

export default LanesUI;

LanesAspect.addRuntime(LanesUI);
