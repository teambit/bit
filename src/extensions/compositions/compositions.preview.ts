import { Preview } from '../preview/preview.preview';

export class CompositionsPreview {
  render(componentId: string, modules: any) {
    console.log(componentId, modules);
    // modules.mainModule.default(modules.componentMap[componentId][0]);
  }

  static dependencies = [Preview];

  static async provider([preview]: [Preview]) {
    const compPreview = new CompositionsPreview();
    preview.registerPreview({
      name: 'compositions',
      render: compPreview.render.bind(compPreview),
      default: true
    });

    return compPreview;
  }
}
