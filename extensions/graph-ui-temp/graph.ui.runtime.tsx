import { UIRuntime } from '@teambit/ui';

import { ComponentAspect, ComponentUI } from '@teambit/component';
import { GraphUIAspect } from './graph.aspect';
import { GraphSection } from './graph.section';

export class GraphUI {
  static dependencies = [ComponentAspect];
  static runtime = UIRuntime;
  static async provider([componentUI]: [ComponentUI]) {
    const graphUI = new GraphUI();

    const section = new GraphSection();
    componentUI.registerNavigation(section.navigationLink, section.order);
    componentUI.registerRoute(section.route);

    return graphUI;
  }
}

GraphUIAspect.addRuntime(GraphUI);
