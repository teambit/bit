import { Preview } from '../preview/preview.preview';

export class DocsPreview {
  constructor(
    /**
     * preview extension.
     */
    private preview: Preview
  ) {}

  render(componentId: string, modules: any) {
    // only one doc file is supported.
    modules.mainModule.default(modules.componentMap[componentId][0]);
  }

  static dependencies = [Preview];

  static async provider([preview]: [Preview]) {
    const docsPreview = new DocsPreview(preview);
    preview.registerPreview({
      name: 'overview',
      render: docsPreview.render.bind(docsPreview)
    });

    return docsPreview;
  }
}
