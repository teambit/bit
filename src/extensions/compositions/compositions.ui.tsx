import { ComponentUI } from '../component/component.ui';
import { SimulationSection } from './composition.section';

export class CompositionsUI {
  static dependencies = [ComponentUI];

  static async provider([component]: [ComponentUI]) {
    const compositions = new CompositionsUI();
    const section = new SimulationSection(compositions);

    component.registerRoute(section.route);
    component.registerNavigation(section.navigationLink);

    return compositions;
  }
}
