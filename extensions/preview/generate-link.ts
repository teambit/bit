// :TODO refactor to building an AST and generate source code based on it.
export function generateLink(prefix: string, componentMap: any, defaultModule?: string): string {
  return `
import { linkModules } from '${require.resolve('./preview.preview.runtime').replace(/\\/g, '\\\\')}';
import harmony from '${require.resolve('@teambit/harmony').replace(/\\/g, '\\\\')}';
${defaultModule ? `const defaultModule = require('${defaultModule.replace(/\\/g, '\\\\')}'` : ''});
linkModules('${prefix}', defaultModule, {
  ${componentMap
    .toArray()
    .map(([component, modulePaths]: any) => {
      return `'${component.id.fullName}': [${modulePaths
        .map((path) => {
          const windowsCompatibalePath = path.replace(/\\/g, '\\\\');
          return `require('${windowsCompatibalePath}')`;
        })
        .join(', ')}]`;
    })
    .join(',\n')}
});  
`;
}
