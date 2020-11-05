import { ComponentType } from 'react';
import { UIRuntime } from '@teambit/ui';
import { Slot, SlotRegistry } from '@teambit/harmony';

import { ComponentAspect, ComponentUI, ComponentModel } from '@teambit/component';
import { GraphAspect } from './graph.aspect';
import { GraphSection } from './ui/graph.section';

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
  static dependencies = [ComponentAspect];
  static runtime = UIRuntime;
  static slots = [Slot.withType<ComponentWidget>()];
  static async provider([componentUI]: [ComponentUI], config, [componentWidgetSlot]: [ComponentWidgetSlot]) {
    const graphUI = new GraphUI(componentWidgetSlot);
    const section = new GraphSection(componentWidgetSlot);
    componentUI.registerNavigation(section.navigationLink, section.order);
    componentUI.registerRoute(section.route);

    return graphUI;
  }
}

GraphAspect.addRuntime(GraphUI);
