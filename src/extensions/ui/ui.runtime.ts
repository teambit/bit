// import harmony from '@teambit/harmony';
// import { UIRuntimeExtension } from './ui.ui.runtime';
// import { DocsUI } from '../docs/docs.ui.runtime';
// import { TesterUI } from '../tester/tester.ui.runtime';
// import { ChangeLogUI } from '../changelog/changelog.ui.runtime';
// import { ComponentUI } from '../component/component.ui.runtime';
// import { CompositionsUI } from '../compositions/compositions.ui.runtime';

// /**
//  * configure all core extensions
//  * TODO: pass all other extensions from above.
//  */
// harmony
//   .run([UIRuntimeExtension, TesterUI, ChangeLogUI, CompositionsUI, DocsUI, ComponentUI])
//   .then(() => {
//     const uiExtension = harmony.get<UIRuntimeExtension>('UIRuntimeExtension');
//     uiExtension.render();
//   })
//   .catch((err) => {
//     throw err;
//   });
