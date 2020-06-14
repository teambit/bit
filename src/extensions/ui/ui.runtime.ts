import harmony from '@teambit/harmony';
import { UIRuntimeExtension } from './ui.ui';
import { DocsUI } from '../docs/docs.ui';
import { TesterUI } from '../tester/tester.ui';

/**
 * configure all core extensions
 * :TODO pass all other extensions from above.
 */
harmony
  .run([UIRuntimeExtension, DocsUI, TesterUI])
  .then(() => {
    const uiExtension = harmony.get<UIRuntimeExtension>('UIRuntimeExtension');
    uiExtension.render();
  })
  .catch(err => {
    throw err;
  });
