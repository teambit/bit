import harmony from '@teambit/harmony';
import { DocsPreview } from '../docs/docs.preview';
import { Preview } from './preview.preview';
import { CompositionsPreview } from '../compositions/compositions.preview';
import { GraphQlUI } from '../graphql/graphql.ui';

/**
 * configure all core extensions
 * :TODO pass all other extensions from above.
 */
harmony
  .run([Preview, DocsPreview, CompositionsPreview, GraphQlUI])
  .then(() => {
    const uiExtension = harmony.get<Preview>('Preview');
    uiExtension.render();
  })
  .catch((err) => {
    throw err;
  });
