import { ComponentType } from 'react';
import { UIRuntime } from '@teambit/ui';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { ComponentCompareUI, ComponentCompareAspect } from '@teambit/component-compare';
import { ComponentAspect, ComponentUI, ComponentModel } from '@teambit/component';
import { GraphAspect } from './graph.aspect';
import { GraphSection } from './ui/graph.section';
import { GraphCompareSection } from './graph.compare.section';
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
  static dependencies = [ComponentAspect, ComponentCompareAspect];
  static runtime = UIRuntime;
  static slots = [Slot.withType<ComponentWidget>()];
  static defaultConfig = {
    componentTab: true,
  };

  static async provider(
    [componentUI, componentCompare]: [ComponentUI, ComponentCompareUI],
    config: GraphUIConfig,
    [componentWidgetSlot]: [ComponentWidgetSlot]
  ) {
    const graphUI = new GraphUI(componentWidgetSlot);
    const section = new GraphSection(componentWidgetSlot);
    const graphSection = new GraphCompareSection();
    if (config.componentTab) componentUI.registerNavigation(section.navigationLink, section.order);
    componentUI.registerRoute(section.route);
    componentCompare.registerNavigation({
      props: graphSection.navigationLink,
      order: graphSection.navigationLink.order,
    });
    componentCompare.registerRoutes([graphSection.route]);
    return graphUI;
  }
}

GraphAspect.addRuntime(GraphUI);
