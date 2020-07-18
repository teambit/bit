import { ComponentUI } from '../component/component.ui';
import { CompositionsSection } from './composition.section';

export class CompositionsUI {
  static dependencies = [ComponentUI];

  static async provider([component]: [ComponentUI]) {
    const compositions = new CompositionsUI();
    const section = new CompositionsSection(compositions);

    component.registerRoute(section.route);
    component.registerNavigation(section.navigationLink);

    return compositions;
  }
}

export default CompositionsUI;
