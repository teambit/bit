import React, { ReactNode } from 'react';
import { PreviewAspect, RenderingContext, PreviewPreview, PreviewRuntime, PreviewModule } from '@teambit/preview';

import { DocsAspect } from './docs.aspect';

export class DocsPreview {
  constructor(
    /**
     * preview extension.
     */
    private preview: PreviewPreview
  ) {}

  render = (componentId: string, modules: PreviewModule, [compositions]: [any], context: RenderingContext) => {
    const docsModule = this.selectPreviewModel(componentId, modules);

    modules.mainModule.default(NoopProvider, componentId, docsModule, compositions, context);
  };

  selectPreviewModel(componentId: string, modules: PreviewModule) {
    const relevant = modules.componentMap[componentId];
    if (!relevant) return undefined;

    // only one doc file is supported.
    return relevant[0];
  }

  static runtime = PreviewRuntime;
  static dependencies = [PreviewAspect];

  static async provider([preview]: [PreviewPreview]) {
    const docsPreview = new DocsPreview(preview);
    preview.registerPreview({
      name: 'overview',
      render: docsPreview.render.bind(docsPreview),
      selectPreviewModel: docsPreview.selectPreviewModel.bind(docsPreview),
      include: ['compositions'],
    });

    return docsPreview;
  }
}

DocsAspect.addRuntime(DocsPreview);

function NoopProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
