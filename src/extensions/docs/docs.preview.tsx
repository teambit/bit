import { Preview } from '../preview/preview.preview';
import { PreviewExtension } from '../preview/preview.extension';

let LOADED_DOCS = [];
let DOCS_TEMPLATE = (doc: any) => doc;
export class DocsPreview {
  constructor(
    /**
     * preview extension.
     */
    private preview: PreviewExtension
  ) {}

  render(componentId: string) {
    // ran's hack for getting the data to the workspace
    const docs = LOADED_DOCS[componentId];
    DOCS_TEMPLATE(docs);
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

export function addDocs(template, docModules) {
  LOADED_DOCS = docModules;
  DOCS_TEMPLATE = template;
}
