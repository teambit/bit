import type { ReactNode } from 'react';
import { ComponentType } from 'react';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { ComponentAspect, ComponentUI } from '@teambit/component';
import { UIRuntime } from '@teambit/ui';
import { CompositionsSection } from './composition.section';
import { CompositionsAspect } from './compositions.aspect';
import { MenuBarWidget } from './compositions';

export type CompositionsMenuSlot = SlotRegistry<MenuBarWidget[]>;
export type EmptyStateSlot = SlotRegistry<ComponentType>;

export class CompositionsUI {
  constructor(private menuBarWidgetSlot: CompositionsMenuSlot, private emptyStateSlot: EmptyStateSlot) {}

  /**
   * register a new tester empty state. this allows to register a different empty state from each environment for example.
   */
  registerEmptyState(emptyStateComponent: ComponentType) {
    this.emptyStateSlot.register(emptyStateComponent);
    return this;
  }

  registerMenuWidget(...widget: MenuBarWidget[]) {
    this.menuBarWidgetSlot.register(widget);
  }

  static dependencies = [ComponentAspect];
  static runtime = UIRuntime;
  static slots = [Slot.withType<ReactNode>(), Slot.withType<ComponentType>()];

  static async provider(
    [component]: [ComponentUI],
    config: {},
    [compositionMenuSlot, emptyStateSlot]: [CompositionsMenuSlot, EmptyStateSlot]
  ) {
    const compositions = new CompositionsUI(compositionMenuSlot, emptyStateSlot);
    const section = new CompositionsSection(
      compositions,
      { menuBarWidgetSlot: compositions.menuBarWidgetSlot },
      emptyStateSlot
    );

    component.registerRoute(section.route);
    component.registerNavigation(section.navigationLink, section.order);

    return compositions;
  }
}

export default CompositionsUI;

CompositionsAspect.addRuntime(CompositionsUI);
