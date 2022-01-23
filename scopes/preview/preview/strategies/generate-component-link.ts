import { toWindowsCompatiblePath } from '@teambit/toolbox.path.to-windows-compatible-path';

export type ModuleVar = {
  prefix: string;
  paths: string[];
};

export function generateComponentLink(modules: ModuleVar[]): string {
  return `${modules
    .map((moduleVar) => {
      return `export const ${moduleVar.prefix} = [${moduleVar.paths
        .map((path) => `require('${toWindowsCompatiblePath(path)}')`)
        .join(', ')}]`;

      // return `export { * as ${moduleVar.prefix} } from '${toWindowsCompatiblePath(moduleVar.paths)}'`;
    })
    .join('\n')}
`;
}
