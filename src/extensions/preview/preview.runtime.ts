import harmony from '@teambit/harmony';
import { DocsPreview } from '../docs/docs.preview';
import { Preview } from './preview.preview';
import { CompositionsPreview } from '../compositions/compositions.preview';

/**
 * configure all core extensions
 * :TODO pass all other extensions from above.
 */
harmony
  .run([Preview, DocsPreview, CompositionsPreview])
  .then(() => {
    const uiExtension = harmony.get<Preview>('Preview');
    uiExtension.render();
  })
  .catch(err => {
    throw err;
  });
