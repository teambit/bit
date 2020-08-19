import { Preview } from '../preview';
import { GraphQlUI } from '../graphql';

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

  static dependencies = [Preview, GraphqlUI];

  static async provider([preview, graphql]: [Preview, GraphqlUI]) {
    const docsPreview = new DocsPreview(preview, graphql);
    preview.registerPreview({
      name: 'overview',
      render: docsPreview.render,
      include: ['compositions'],
    });

    return docsPreview;
  }
}
