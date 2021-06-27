import {
  PreviewAspect,
  PreviewPreview,
  RenderingContext,
  PreviewRuntime,
  PreviewModule,
  ModuleFile,
} from '@teambit/preview';
import head from 'lodash.head';

import { CompositionsAspect } from './compositions.aspect';

export class CompositionsPreview {
  constructor(
    /**
     * preview extension.
     */
    private preview: PreviewPreview
  ) {}

  async render(componentId: string, modules: PreviewModule, otherPreviewDefs, context: RenderingContext) {
    console.log('im in render of composition');
    if (!modules.componentMap[componentId]) return;

    const compositions = await this.selectPreviewModel(componentId, modules);
    const active = this.getActiveComposition(compositions);

    modules.mainModule.default(active, context);
  }

  /** gets relevant information for this preview to render */
  async selectPreviewModel(componentId: string, previewModule: PreviewModule) {
    // const files = (await previewModule.componentMap[componentId]()) || [];
    const allFunc = previewModule.componentMap[componentId];
    const promises = allFunc.map((func) => func());
    const files = await Promise.all(promises);
    console.log('selectPreviewModel', files);

    // allow compositions to come from many files. It is assumed they will have unique named
    // const combined = Object.assign({}, ...files);
    const combined = Object.assign({}, ...files);
    return combined;
  }

  private getActiveComposition(module: ModuleFile) {
    const chosen = window.location.hash.split('&')[1];

    if (!chosen) {
      const first = head(Object.values(module));
      return first;
    }

    return module[chosen];
  }

  static runtime = PreviewRuntime;

  static dependencies = [PreviewAspect];

  static async provider([preview]: [PreviewPreview]) {
    const compPreview = new CompositionsPreview(preview);
    preview.registerPreview({
      name: 'compositions',
      render: compPreview.render.bind(compPreview),
      selectPreviewModel: compPreview.selectPreviewModel.bind(compPreview),
      default: true,
    });

    return compPreview;
  }
}

CompositionsAspect.addRuntime(CompositionsPreview);
