import harmony from '@teambit/harmony';
import { DocsPreview } from '../docs/docs.preview';
import { Preview } from './preview.preview';
import { CompositionsPreview } from '../compositions/compositions.preview';
import { GraphqlUI } from '../graphql/graphql.ui.runtime';

/**
 * configure all core extensions
 * :TODO pass all other extensions from above.
 */
harmony
  .run([Preview, DocsPreview, CompositionsPreview, GraphqlUI])
  .then(() => {
    const uiExtension = harmony.get<Preview>('@teambit/preview');
    uiExtension.render();
  })
  .catch((err) => {
    throw err;
  });
