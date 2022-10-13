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
import { CompositionBrowserMetadataObject } from './composition';

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
    const metadata = this.getMetadata(componentId.fullName, modules);
    const active = this.getActiveComposition(compositions, metadata);

    modules.mainModule.default(active, context);
  }

  /** gets relevant information for this preview to render */
  selectPreviewModel(componentFullName: string, previewModule: PreviewModule) {
    const files = previewModule.componentMap[componentFullName] || [];

    // allow compositions to come from many files. It is assumed they will have unique named
    const combined = Object.assign({}, ...files);
    return combined;
  }

  getMetadata(componentFullName: string, previewModule: PreviewModule): CompositionBrowserMetadataObject | undefined {
    const metadata = previewModule?.componentMapMetadata
      ? previewModule.componentMapMetadata[componentFullName]
      : undefined;
    if (metadata) {
      return metadata as CompositionBrowserMetadataObject;
    }
    return undefined;
  }

  private getActiveComposition(module: ModuleFile, metadata?: CompositionBrowserMetadataObject) {
    const firstQueryParam = window.location.hash.split('&')[1];
    const query = this.preview.getQuery();
    const compositionId = this.preview.getParam(query, 'name') || firstQueryParam;

    if (compositionId && module[compositionId]) {
      return module[compositionId];
    }

    if (metadata && metadata.compositions) {
      const first = head(metadata.compositions);
      const firstId = first?.identifier;
      if (firstId && module[firstId]) {
        return module[firstId];
      }
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
