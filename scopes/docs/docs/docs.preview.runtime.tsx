import React, { ReactNode } from 'react';
import { PreviewAspect, RenderingContext, PreviewPreview, PreviewRuntime, PreviewModule } from '@teambit/preview';
import { ComponentID } from '@teambit/component-id';

import { DocsAspect } from './docs.aspect';

export class DocsPreview {
  constructor(
    /**
     * preview extension.
     */
    private preview: PreviewPreview
  ) {}

  render = (componentId: ComponentID, modules: PreviewModule, [compositions]: [any], context: RenderingContext) => {
    const docsModule = this.selectPreviewModel(componentId.fullName, modules);

    modules.mainModule.default(NoopProvider, componentId.toString(), docsModule, compositions, context);
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
