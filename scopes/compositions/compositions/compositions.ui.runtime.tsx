import type { ReactNode } from 'react';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { ComponentAspect, ComponentUI } from '@teambit/component';
import { UIRuntime } from '@teambit/ui';

import { CompositionsSection } from './composition.section';
import { CompositionsAspect } from './compositions.aspect';
import { MenuBarWidget } from './compositions';

export type MenuBarWidgetsSlot = SlotRegistry<MenuBarWidget[]>;

export class CompositionsUI {
  constructor(private menuBarWidgetSlot: MenuBarWidgetsSlot) {}

  registerMenuWidget(...widget: MenuBarWidget[]) {
    this.menuBarWidgetSlot.register(widget);
  }

  static dependencies = [ComponentAspect];
  static runtime = UIRuntime;
  static slots = [Slot.withType<ReactNode>()];

  static async provider([component]: [ComponentUI], config, [slot]: [MenuBarWidgetsSlot]) {
    const compositions = new CompositionsUI(slot);
    const section = new CompositionsSection(compositions, { menuBarWidgetSlot: compositions.menuBarWidgetSlot });

    component.registerRoute(section.route);
    component.registerNavigation(section.navigationLink, section.order);

    return compositions;
  }
}

export default CompositionsUI;

CompositionsAspect.addRuntime(CompositionsUI);
