import { ComponentUI, ComponentAspect } from '../component';
import { OverviewSection } from './overview.section';
import { UIRuntime } from '../ui';
import { DocsAspect } from './docs.aspect';

export class DocsUI {
  static dependencies = [ComponentAspect];

  static runtime = UIRuntime;

  static async provider([component]: [ComponentUI]) {
    const docs = new DocsUI();
    const section = new OverviewSection(docs);

    component.registerRoute(section.route);
    component.registerNavigation(section.navigationLink);

    return docs;
  }
}

export default DocsUI;

DocsAspect.addRuntime(DocsUI);
