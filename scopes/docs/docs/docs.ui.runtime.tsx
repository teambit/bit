import { ComponentAspect, ComponentUI } from '@teambit/component';
import { UIRuntime } from '@teambit/ui';

import { DocsAspect } from './docs.aspect';
import { OverviewSection } from './overview.section';

export class DocsUI {
  static dependencies = [ComponentAspect];

  static runtime = UIRuntime;

  static async provider([component]: [ComponentUI]) {
    const docs = new DocsUI();
    const section = new OverviewSection(docs);

    component.registerRoute(section.route);
    component.registerNavigation(section.navigationLink, section.order);

    return docs;
  }
}

export default DocsUI;

DocsAspect.addRuntime(DocsUI);
