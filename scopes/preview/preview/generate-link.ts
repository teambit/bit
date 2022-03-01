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

${
  // generate imports:
  componentMap
    .toArray()
    .map(([, modulePath], compIdx) =>
      modulePath
        .map(
          (path, pathIdx) => `import * as ${moduleVarName(compIdx, pathIdx)} from '${toWindowsCompatiblePath(path)}'`
        )
        .join('\n')
    )
    .join('\n')
}

linkModules('${prefix}', {
  mainModule,
  isSplitComponentBundle: ${isSplitComponentBundle},
  componentMap: {
${
  // use imports:
  componentMap
    .toArray()
    .map(([component, modulePaths], compIdx) => {
      return `    '${component.id.fullName}': [${modulePaths
        .map((_, pathIdx) => moduleVarName(compIdx, pathIdx))
        .join(', ')}]`;
    })
    .join(',\n')
}
  }
});
`;
}

function moduleVarName(componentIdx: number, fileIdx: number) {
  return `file_${componentIdx}_${fileIdx}`;
}
