import { toWindowsCompatiblePath } from '@teambit/toolbox.path.to-windows-compatible-path';
import type { ComponentMap } from '@teambit/component';
import { computeExposeKey } from './compute-exposes';

// :TODO refactor to building an AST and generate source code based on it.
export function generateMfLink(prefix: string, componentMap: ComponentMap<string[]>, defaultModule?: string): string {
  return `
  console.log('mf link file');
  // debugger
const promises = [
  // import { linkModules } from '${toWindowsCompatiblePath(require.resolve('./preview.preview.runtime'))}';
  import('${toWindowsCompatiblePath(require.resolve('./preview.preview.runtime'))}').then(Module => Module.linkModules),
  // import harmony from '${toWindowsCompatiblePath(require.resolve('@teambit/harmony'))}';
  import('${toWindowsCompatiblePath(require.resolve('@teambit/harmony'))}')
];
Promise.all(promises).then(([linkModules, harmony]) => {
  console.log('inside mf link promise all');
  ${defaultModule ? `const defaultModule = require('${toWindowsCompatiblePath(defaultModule)}'` : ''});
  linkModules('${prefix}', defaultModule, {
    ${componentMap
      .toArray()
      .map(([component, modulePaths]: any) => {
        const compFullName = component.id.fullName;
        return `'${compFullName}': [${modulePaths
          .map((path, index) => {
            const exposedKey = computeExposeKey(compFullName, prefix, index);
            // TODO: take teambitReactReactMf dynamically
            return `() => {
              debugger;
            console.log('inside link modules');
            import('teambitReactReactMf/${exposedKey}').then((Module) => {
              console.log('exposedKey module', Module);
              return Module;
            })}`;
          })
          .join(', ')}]`;
      })
      .join(',\n')}
  });
});
`;
}
