import React, { ComponentType } from 'react';
import { UIRuntime } from '@teambit/ui';
import { SlotRegistry, Slot } from '@teambit/harmony';
import { ComponentAspect, ComponentUI } from '@teambit/component';
import { CompareTests } from '@teambit/defender.ui.test-compare';
import { ComponentCompareUI, ComponentCompareAspect } from '@teambit/component-compare';
import { TestCompareSection } from '@teambit/defender.ui.test-compare-section';
import { TestsSection } from './tests.section';
import { TesterAspect } from './tester.aspect';

export type EmptyStateSlot = SlotRegistry<ComponentType>;
export class TesterUI {
  static dependencies = [ComponentAspect, ComponentCompareAspect];

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

  getTesterCompare() {
    return <CompareTests emptyState={this.emptyStateSlot} />;
  }

  static slots = [Slot.withType<ComponentType>()];

  static async provider(
    [component, componentCompare]: [ComponentUI, ComponentCompareUI],
    config,
    [emptyStateSlot]: [EmptyStateSlot]
  ) {
    const testerUi = new TesterUI(component, emptyStateSlot);
    const section = new TestsSection(emptyStateSlot);
    const testerCompareSection = new TestCompareSection(testerUi);
    component.registerRoute(section.route);
    component.registerNavigation(section.navigationLink, section.order);
    componentCompare.registerNavigation({
      props: testerCompareSection.navigationLink,
      order: testerCompareSection.order,
    });
    componentCompare.registerRoutes([testerCompareSection.route]);
    return testerUi;
  }
}

export default TesterUI;

TesterAspect.addRuntime(TesterUI);
