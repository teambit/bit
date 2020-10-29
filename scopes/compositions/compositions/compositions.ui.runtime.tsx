import { ComponentAspect, ComponentUI } from '@teambit/component';
import { UIRuntime } from '@teambit/ui';

import { CompositionsSection } from './composition.section';
import { CompositionsAspect } from './compositions.aspect';

export class CompositionsUI {
  static dependencies = [ComponentAspect];

  static runtime = UIRuntime;

  static async provider([component]: [ComponentUI]) {
    const compositions = new CompositionsUI();
    const section = new CompositionsSection(compositions);

    component.registerRoute(section.route);
    component.registerNavigation(section.navigationLink, section.order);

    return compositions;
  }
}

export default CompositionsUI;

CompositionsAspect.addRuntime(CompositionsUI);
