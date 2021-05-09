import { ComponentType } from 'react';
import { UIRuntime } from '@teambit/ui';
import { SlotRegistry, Slot } from '@teambit/harmony';
import { ComponentAspect, ComponentUI } from '@teambit/component';
import { TestsSection } from './tests.section';
import { TesterAspect } from './tester.aspect';

export type EmptyStateSlot = SlotRegistry<ComponentType>;
export class TesterUI {
  static dependencies = [ComponentAspect];

  static runtime = UIRuntime;

  stageKey?: string;

  constructor(private component: ComponentUI, private emptyStateSlot: EmptyStateSlot) {}

  /**
   * register a new tester empty state. this allows to register a different empty state from each environment for example.
   */
  registerEmptyState(emptyStateComponent: ComponentType) {
    this.emptyStateSlot.register(emptyStateComponent);
    return this;
  }

  static slots = [Slot.withType<ComponentType>()];

  static async provider([component]: [ComponentUI], config, [emptyStateSlot]: [EmptyStateSlot]) {
    const testerUi = new TesterUI(component, emptyStateSlot);

    const section = new TestsSection(emptyStateSlot);

    component.registerRoute(section.route);
    component.registerNavigation(section.navigationLink, section.order);

    return testerUi;
  }
}

export default TesterUI;

TesterAspect.addRuntime(TesterUI);
