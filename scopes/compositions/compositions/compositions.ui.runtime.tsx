import type { ReactNode } from 'react';
import { ComponentType } from 'react';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { ComponentAspect, ComponentUI } from '@teambit/component';
import { UIRuntime } from '@teambit/ui';
import { ComponentCompareUI, ComponentCompareAspect } from '@teambit/component-compare';
import { CompositionsSection } from './composition.section';
import { CompositionsAspect } from './compositions.aspect';
import { MenuBarWidget } from './compositions';
import { CompositionCompareSection } from './composition.compare.section';

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

  static dependencies = [ComponentAspect, ComponentCompareAspect];
  static runtime = UIRuntime;
  static slots = [Slot.withType<ReactNode>(), Slot.withType<ComponentType>()];

  static async provider(
    [component, componentCompare]: [ComponentUI, ComponentCompareUI],
    config: {},
    [compositionMenuSlot, emptyStateSlot]: [CompositionsMenuSlot, EmptyStateSlot]
  ) {
    const compositions = new CompositionsUI(compositionMenuSlot, emptyStateSlot);
    const section = new CompositionsSection(
      compositions,
      { menuBarWidgetSlot: compositions.menuBarWidgetSlot },
      emptyStateSlot
    );
    const compositionCompare = new CompositionCompareSection(emptyStateSlot);

    component.registerRoute(section.route);
    component.registerNavigation(section.navigationLink, section.order);
    componentCompare.registerNavigation({
      props: compositionCompare.navigationLink,
      order: compositionCompare.navigationLink.order,
    });
    componentCompare.registerRoutes([compositionCompare.route]);
    return compositions;

    
  }
}

export default CompositionsUI;

CompositionsAspect.addRuntime(CompositionsUI);
