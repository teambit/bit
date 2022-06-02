import { ComponentType } from 'react';
import { UIRuntime } from '@teambit/ui';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { ComponentCompareUI, ComponentCompareAspect } from '@teambit/component-compare';
import { ComponentAspect, ComponentUI, ComponentModel } from '@teambit/component';
import { GraphAspect } from './graph.aspect';
import { GraphSection } from './ui/graph.section';
import { GraphCompareSection } from './graph.compare.section';

export interface ComponentWidgetProps extends React.HTMLAttributes<HTMLDivElement> {
  component: ComponentModel;
}
export type ComponentWidget = ComponentType<ComponentWidgetProps>;
export type ComponentWidgetSlot = SlotRegistry<ComponentWidget>;

/**
 * Presents dependencies graph in the component page
 */
export class GraphUI {
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
  static async provider(
    [componentUI, componentCompare]: [ComponentUI, ComponentCompareUI],
    config,
    [componentWidgetSlot]: [ComponentWidgetSlot]
  ) {
    const graphUI = new GraphUI(componentWidgetSlot);
    const section = new GraphSection(componentWidgetSlot);
    const graphSection = new GraphCompareSection();
    componentUI.registerNavigation(section.navigationLink, section.order);
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
