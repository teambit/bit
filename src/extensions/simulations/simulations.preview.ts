import { Preview } from '../preview/preview.preview';

export class SimulationPreview {
  static dependencies = [Preview];

  static async provider([preview]: [Preview]) {
    preview.registerPreview({
      name: 'simulation',
      render: () => {}
    });
  }
}
