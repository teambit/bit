import { GraphqlAspect, GraphqlUI } from '@teambit/graphql';
import { PreviewAspect, PreviewPreview, PreviewRuntime } from '@teambit/preview';

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

  render = (componentId: string, modules: any, [compositions]: [any]) => {
    if (!modules.componentMap[componentId]) {
      modules.mainModule.default(this.graphql.getProvider, componentId, {}, compositions);
      return;
    }

    // only one doc file is supported.
    modules.mainModule.default(
      this.graphql.getProvider,
      componentId,
      modules.componentMap[componentId][0],
      compositions
    );
  };

  static runtime = PreviewRuntime;
  static dependencies = [PreviewAspect, GraphqlAspect];

  static async provider([preview, graphql]: [PreviewPreview, GraphqlUI]) {
    const docsPreview = new DocsPreview(preview, graphql);
    preview.registerPreview({
      name: 'overview',
      render: docsPreview.render,
      include: ['compositions'],
    });

    return docsPreview;
  }
}

DocsAspect.addRuntime(DocsPreview);
