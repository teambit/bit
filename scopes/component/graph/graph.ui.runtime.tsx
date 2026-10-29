import type { ComponentType } from 'react';
import { UIRuntime } from '@teambit/harmony.modules.runtimes';
import type { SlotRegistry } from '@teambit/harmony';
import { Slot } from '@teambit/harmony';
import type { ComponentUI, ComponentModel } from '@teambit/component';
import { ComponentAspect } from '@teambit/component';
import { GraphAspect } from './graph.aspect';
import { GraphSection } from './ui/graph.section';
import { DependenciesGraph } from './ui/dependencies-graph';

export interface ComponentWidgetProps extends React.HTMLAttributes<HTMLDivElement> {
  component: ComponentModel;
}
export type ComponentWidget = ComponentType<ComponentWidgetProps>;
export type ComponentWidgetSlot = SlotRegistry<ComponentWidget>;

export type GraphUIConfig = {
  componentTab: boolean;
};

/**
 * Presents dependencies graph in the component page
 */
export class GraphUI {
  getDependenciesGraph() {
    return DependenciesGraph;
  }

  /**
   * adds plugins to component nodes
   * @param value
   */
  registerComponentWidget(value: ComponentWidget) {
    this.componentWidgetSlot.register(value);
  }

  constructor(private componentWidgetSlot: ComponentWidgetSlot) {}
  static dependencies = [ComponentAspect];
  static runtime = UIRuntime;
  static slots = [Slot.withType<ComponentWidget>()];
  static defaultConfig = {
    componentTab: true,
  };

  static async provider(
    [componentUI]: [ComponentUI],
    config: GraphUIConfig,
    [componentWidgetSlot]: [ComponentWidgetSlot]
  ) {
    const graphUI = new GraphUI(componentWidgetSlot);
    const section = new GraphSection(componentWidgetSlot);
    if (config.componentTab) componentUI.registerNavigation(section.navigationLink, section.order);
    componentUI.registerRoute(section.route);
    return graphUI;
  }
}

GraphAspect.addRuntime(GraphUI);
