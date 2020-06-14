import harmony from '@teambit/harmony';
import { UIRuntimeExtension } from './ui.ui';
import { DocsUI } from '../docs/docs.ui';

/**
 * configure all core extensions
 * :TODO pass all other extensions from above.
 */
harmony
  .run([UIRuntimeExtension, DocsUI])
  .then(() => {
    const uiExtension = harmony.get<UIRuntimeExtension>('UIRuntimeExtension');
    uiExtension.render();
  })
  .catch(err => {
    throw err;
  });
