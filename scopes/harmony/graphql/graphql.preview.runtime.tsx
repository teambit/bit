import PreviewAspect, { PreviewPreview, PreviewRuntime } from '@teambit/preview';

import { GraphqlAspect } from './graphql.aspect';
import { GraphqlUI } from './graphql.ui.runtime';

export class GraphqlPreview extends GraphqlUI {
  static runtime = PreviewRuntime;
  static slots = GraphqlUI.slots;
  static dependencies = [PreviewAspect];
}

// @ts-ignore
GraphqlPreview.provider = ([previewPreview]: [PreviewPreview]) => {
  const graphqlPreview = new GraphqlPreview();

  previewPreview.registerRenderContext(() => graphqlPreview.getConfig());

  return graphqlPreview;
};

GraphqlAspect.addRuntime(GraphqlPreview);
