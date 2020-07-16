import harmony from '@teambit/harmony';
import { UIRuntimeExtension } from './ui.ui';
import { DocsUI } from '../docs/docs.ui';
import { TesterUI } from '../tester/tester.ui';
import { ChangeLogUI } from '../changelog/changelog.ui';
import { DependenciesUI } from '../dependencies/dependencies.ui';
import { ComponentUI } from '../component/component.ui';
import { CompositionsUI } from '../compositions/compositions.ui';

/**
 * configure all core extensions
 * :TODO pass all other extensions from above.
 */
harmony
  .run([UIRuntimeExtension, TesterUI, DependenciesUI, ChangeLogUI, CompositionsUI, DocsUI, ComponentUI])
  .then(() => {
    const uiExtension = harmony.get<UIRuntimeExtension>('UIRuntimeExtension');
    uiExtension.render();
  })
  .catch(err => {
    throw err;
  });
