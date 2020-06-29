import { ComponentUI } from '../component/component.ui';
import { SimulationSection } from './simulation.section';

export class SimulationsUI {
  static dependencies = [ComponentUI];

  static async provider([component]: [ComponentUI]) {
    const sims = new SimulationsUI();
    const section = new SimulationSection(sims);

    component.registerRoute(section.route);
    component.registerNavigation(section.navigationLink);

    return sims;
  }
}
