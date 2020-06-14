import harmony from '@teambit/harmony';
import { UIRuntimeExtension } from './ui.ui';
import { DocsUI } from '../docs/docs.ui';
import { TesterUI } from '../tester/tester.ui';
import { ChangeLogUI } from '../changelog/changelog.ui';
import { DependenciesUI } from '../dependencies/dependencies.ui';

/**
 * configure all core extensions
 * :TODO pass all other extensions from above.
 */
harmony
  .run([UIRuntimeExtension, TesterUI, DependenciesUI, ChangeLogUI, DocsUI])
  .then(() => {
    const uiExtension = harmony.get<UIRuntimeExtension>('UIRuntimeExtension');
    uiExtension.render();
  })
  .catch(err => {
    throw err;
  });
