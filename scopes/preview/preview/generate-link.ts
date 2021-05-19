import { toWindowsCompatiblePath } from '@teambit/toolbox.path.to-windows-compatible-path';
import type { ComponentMap } from '@teambit/component';

// :TODO refactor to building an AST and generate source code based on it.
export function generateLink(prefix: string, componentMap: ComponentMap<string[]>, defaultModule?: string): string {
  return `
import { linkModules } from '${toWindowsCompatiblePath(require.resolve('./preview.preview.runtime'))}';
import harmony from '${toWindowsCompatiblePath(require.resolve('@teambit/harmony'))}';
${defaultModule ? `const defaultModule = require('${toWindowsCompatiblePath(defaultModule)}'` : ''});
linkModules('${prefix}', defaultModule, {
  ${componentMap
    .toArray()
    .map(([component, modulePaths]: any) => {
      return `'${component.id.fullName}': [${modulePaths
        .map((path) => `require('${toWindowsCompatiblePath(path)}')`)
        .join(', ')}]`;
    })
    .join(',\n')}
});  
`;
}
