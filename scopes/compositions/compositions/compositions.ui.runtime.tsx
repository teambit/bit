import type { ReactNode } from 'react';
import React, { ComponentType } from 'react';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { ComponentAspect, ComponentUI } from '@teambit/component';
import { UIRuntime } from '@teambit/ui';
import { CompositionCompareSection } from '@teambit/compositions.ui.composition-compare-section';
import { CompositionCompare } from '@teambit/compositions.ui.composition-compare';
import { ComponentCompareUI, ComponentCompareAspect } from '@teambit/component-compare';
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

  getCompositionsCompare = () => {
    return <CompositionCompare emptyState={this.emptyStateSlot} />;
  };

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
    const compositionCompare = new CompositionCompareSection(compositions);
    component.registerRoute(section.route);
    component.registerNavigation(section.navigationLink, section.order);
    componentCompare.registerNavigation(compositionCompare);
    componentCompare.registerRoutes([compositionCompare.route]);
    return compositions;
  }
}

export default CompositionsUI;

CompositionsAspect.addRuntime(CompositionsUI);
