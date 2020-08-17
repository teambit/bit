import { Preview } from '@teambit/preview/preview.preview';
import { GraphQlUI } from '@teambit/graphql/graphql.ui';

export class DocsPreview {
  static id = '@teambit/docs';

  constructor(
    /**
     * preview extension.
     */
    private preview: Preview,

    /**
     * graphql extension.
     */
    private graphql: GraphQlUI
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

  static dependencies = [Preview, GraphQlUI];

  static async provider([preview, graphql]: [Preview, GraphQlUI]) {
    const docsPreview = new DocsPreview(preview, graphql);
    preview.registerPreview({
      name: 'overview',
      render: docsPreview.render,
      include: ['compositions'],
    });

    return docsPreview;
  }
}
