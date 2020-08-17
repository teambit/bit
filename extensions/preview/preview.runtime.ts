import harmony from '@teambit/harmony';
import { DocsPreview } from '@teambit/docs/docs.preview';
import { Preview } from './preview.preview';
import { CompositionsPreview } from '@teambit/compositions/compositions.preview';
import { GraphQlUI } from '@teambit/graphql/graphql.ui';

/**
 * configure all core extensions
 * :TODO pass all other extensions from above.
 */
harmony
  .run([Preview, DocsPreview, CompositionsPreview, GraphQlUI])
  .then(() => {
    const uiExtension = harmony.get<Preview>('@teambit/preview');
    uiExtension.render();
  })
  .catch((err) => {
    throw err;
  });
