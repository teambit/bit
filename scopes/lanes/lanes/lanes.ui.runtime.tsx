import { ComponentType } from 'react';
import { UIRuntime } from '@teambit/ui';
import { SlotRegistry, Slot } from '@teambit/harmony';
import { ComponentAspect, ComponentUI } from '@teambit/component';
import { LanesSection } from './lanes.section';
import { LanesAspect } from '@teambit/lanes';

export type EmptyStateSlot = SlotRegistry<ComponentType>;

export class LanesUI {
  static dependencies = [ComponentAspect];

  static runtime = UIRuntime;

  constructor(private component: ComponentUI, private emptyStateSlot: EmptyStateSlot) {}

  /**
   * register a new lane empty state. this allows to register a different empty state from each environment for example.
   */
  registerEmptyState(emptyStateComponent: ComponentType) {
    this.emptyStateSlot.register(emptyStateComponent);
    return this;
  }

  static slots = [Slot.withType<ComponentType>()];

  static async provider([component]: [ComponentUI], config, [emptyStateSlot]: [EmptyStateSlot]) {
    const lanesUi = new LanesUI(component, emptyStateSlot);

    const section = new LanesSection(emptyStateSlot);

    component.registerRoute(section.route);
    component.registerNavigation(section.navigationLink, section.order);

    return lanesUi;
  }
}

export default LanesUI;

LanesAspect.addRuntime(LanesUI);
