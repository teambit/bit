import { ComponentUI } from '../component/component.ui';
import { SimulationSection } from './simulation.section';

export class SimulationsUI {
  static dependencies = [ComponentUI];

  static async provider([component]: [ComponentUI]) {
    const sims = new SimulationsUI();
    component.registerSection(new SimulationSection(sims));

    return sims;
  }
}
