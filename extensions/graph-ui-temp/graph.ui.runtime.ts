import { UIRuntime } from '@teambit/ui';

import { GraphUIAspect } from './graph.aspect';

export class GraphUI {
  static dependencies = [];
  static runtime = UIRuntime;

  static async provider(/* []: [] */) {
    const graphUI = new GraphUI();

    return graphUI;
  }
}

GraphUIAspect.addRuntime(GraphUI);
