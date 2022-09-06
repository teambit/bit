import { ComponentID } from '@teambit/component-id';
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

  render(componentId: ComponentID, modules: PreviewModule, otherPreviewDefs, context: RenderingContext) {
    if (!modules.componentMap[componentId.fullName]) return;

    const compositions = this.selectPreviewModel(componentId.fullName, modules);
    const active = this.getActiveComposition(compositions);

    modules.mainModule.default(active, context);
  }

  /** gets relevant information for this preview to render */
  selectPreviewModel(componentId: string, previewModule: PreviewModule) {
    const files = previewModule.componentMap[componentId] || [];

    // allow compositions to come from many files. It is assumed they will have unique named
    const combined = Object.assign({}, ...files);
    return combined;
  }

  private getActiveComposition(module: ModuleFile) {
    // const chosen = window.location.hash.split('&')[1];
    const query = this.preview.getQuery();
    const param = this.preview.getParam(query, 'name');

    if (param && module[param]) {
      return module[param];
    }

    const first = head(Object.values(module));
    return first;
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
