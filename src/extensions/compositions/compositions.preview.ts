import { Preview } from '../preview/preview.preview';

export class CompositionsPreview {
  constructor(
    /**
     * preview extension.
     */
    private preview: Preview
  ) {}

  render(componentId: string, modules: any) {
    if (!modules.componentMap[componentId]) return;
    const composition = this.getActiveComposition(modules.componentMap[componentId][0]);
    modules.mainModule.default(composition);
  }

  private getActiveComposition(module: any) {
    const chosen = window.location.hash.split('&')[1];

    if (!chosen) {
      // :TODO @uri we should handle more than one file here.
      return Object.keys(module)[0];
    }
    // @uri :TODO move to something more generic in preview extension.
    return module[chosen];
  }

  static dependencies = [Preview];

  static async provider([preview]: [Preview]) {
    const compPreview = new CompositionsPreview(preview);
    preview.registerPreview({
      name: 'compositions',
      render: compPreview.render.bind(compPreview),
      default: true,
    });

    return compPreview;
  }
}
