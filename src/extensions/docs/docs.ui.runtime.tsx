import { ComponentUI, ComponentAspect } from '../component';
import { OverviewSection } from './overview.section';

export class DocsUI {
  static id = '@teambit/docs';

  static dependencies = [ComponentAspect];

  static async provider([component]: [ComponentUI]) {
    const docs = new DocsUI();
    const section = new OverviewSection(docs);

    component.registerRoute(section.route);
    component.registerNavigation(section.navigationLink);

    return docs;
  }
}

export default DocsUI;
