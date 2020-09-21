import PubsubAspect, { PubsubPreview, BitBaseEvent } from '@teambit/pubsub';
import { GraphqlAspect, GraphqlUI } from '@teambit/graphql';
import { PreviewAspect, PreviewPreview, PreviewRuntime } from '@teambit/preview';

import { DocsAspect } from './docs.aspect';

export class DocsPreview {
  constructor(
    /**
     * pubsub extension.
     */
    private pubsub: PubsubPreview,

    /**
     * preview extension.
     */
    private preview: PreviewPreview,

    /**
     * graphql extension.
     */
    private graphql: GraphqlUI
  ) {
    window.addEventListener('click', (e) => {
      const be: BitBaseEvent = {
        type: 'click-inside-an-iframe',
        version: '0.0.1',
        timestamp: Date.now().toString(),
        body: Object.assign({}, e),
      };
      this.pubsub.pub(DocsAspect.id, be);
    });
  }

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
  static dependencies = [PubsubAspect, PreviewAspect, GraphqlAspect];

  static async provider([pubsub, preview, graphql]: [PubsubPreview, PreviewPreview, GraphqlUI]) {
    const docsPreview = new DocsPreview(pubsub, preview, graphql);
    preview.registerPreview({
      name: 'overview',
      render: docsPreview.render,
      include: ['compositions'],
    });

    return docsPreview;
  }
}

DocsAspect.addRuntime(DocsPreview);
