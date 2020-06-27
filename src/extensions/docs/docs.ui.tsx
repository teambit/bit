import { ComponentUI } from '../component/component.ui';
import { OverviewSection } from './overview.section';

export class DocsUI {
  static dependencies = [ComponentUI];

  static async provider([component]: [ComponentUI]) {
    const docs = new DocsUI();
    component.registerSection(new OverviewSection(docs));

    return docs;
  }
}
