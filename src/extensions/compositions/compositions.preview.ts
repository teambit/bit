import { Preview } from '../preview/preview.preview';

export class CompositionsPreview {
  static dependencies = [Preview];

  static async provider([preview]: [Preview]) {
    preview.registerPreview({
      name: 'compositions',
      render: () => {},
      default: true
    });
  }
}
