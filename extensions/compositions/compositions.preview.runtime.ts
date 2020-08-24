import { PreviewAspect, PreviewPreview, PreviewRuntime } from '@teambit/preview';

import { CompositionsAspect } from './compositions.aspect';

export class CompositionsPreview {
  constructor(
    /**
     * preview extension.
     */
    private preview: PreviewPreview
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
      return Object.values(module)[0];
    }
    // @uri :TODO move to something more generic in preview extension.
    return module[chosen];
  }

  static runtime = PreviewRuntime;

  static dependencies = [PreviewAspect];

  static async provider([preview]: [PreviewPreview]) {
    const compPreview = new CompositionsPreview(preview);
    preview.registerPreview({
      name: 'compositions',
      render: compPreview.render.bind(compPreview),
      default: true,
    });

    return compPreview;
  }
}

CompositionsAspect.addRuntime(CompositionsPreview);
