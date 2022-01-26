import { UIRuntime } from '@teambit/ui';
import { LanesAspect } from '@teambit/lanes';
import { LanesDrawer } from '@teambit/lanes.lanes.ui';
import { SidebarAspect, SidebarUI } from '@teambit/sidebar';

export class LanesUI {
  static dependencies = [SidebarAspect];

  static runtime = UIRuntime;

  constructor(private sidebarUI: SidebarUI) {}

  static async provider([sidebarUI]: [SidebarUI]) {
    sidebarUI.registerDrawer(new LanesDrawer());
    const lanesUi = new LanesUI(sidebarUI);
    return lanesUi;
  }
}

export default LanesUI;

LanesAspect.addRuntime(LanesUI);
