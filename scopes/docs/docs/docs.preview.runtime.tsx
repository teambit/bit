import { GraphqlAspect, GraphqlUI } from '@teambit/graphql';
import { PreviewAspect, PreviewPreview, PreviewRuntime, PreviewModule } from '@teambit/preview';

import { DocsAspect } from './docs.aspect';

export class DocsPreview {
  constructor(
    /**
     * preview extension.
     */
    private preview: PreviewPreview,

    /**
     * graphql extension.
     */
    private graphql: GraphqlUI
  ) {}

  render = (componentId: string, modules: PreviewModule, [compositions]: [any]) => {
    const docsModule = this.selectPreviewModel(componentId, modules);

    modules.mainModule.default(this.graphql.getProvider, componentId, docsModule, compositions);
  };

  selectPreviewModel(componentId: string, modules: PreviewModule) {
    const relevant = modules.componentMap[componentId];
    if (!relevant) return undefined;

    // only one doc file is supported.
    return relevant[0];
  }

  static runtime = PreviewRuntime;
  static dependencies = [PreviewAspect, GraphqlAspect];

  static async provider([preview, graphql]: [PreviewPreview, GraphqlUI]) {
    const docsPreview = new DocsPreview(preview, graphql);
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
