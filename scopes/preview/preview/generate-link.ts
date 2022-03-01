import { toWindowsCompatiblePath } from '@teambit/toolbox.path.to-windows-compatible-path';
import type { ComponentMap } from '@teambit/component';

// :TODO refactor to building an AST and generate source code based on it.
export function generateLink(
  prefix: string,
  componentMap: ComponentMap<string[]>,
  mainModule?: string,
  isSplitComponentBundle = false
): string {
  return `
import { linkModules } from '${toWindowsCompatiblePath(require.resolve('./preview.preview.runtime'))}';
import harmony from '${toWindowsCompatiblePath(require.resolve('@teambit/harmony'))}';
${mainModule ? `import * as mainModule from '${toWindowsCompatiblePath(mainModule)}';` : 'const mainModule = {};'};

linkModules('${prefix}', {
  mainModule,
  isSplitComponentBundle: ${isSplitComponentBundle},
  componentMap: {
    ${componentMap
      .toArray()
      .map(([component, modulePaths]) => {
        return `'${component.id.fullName}': [${modulePaths
          .map((path) => `require('${toWindowsCompatiblePath(path)}')`)
          .join(', ')}]`;
      })
      .join(',\n')}
  }
});
`;
}
