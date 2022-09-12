import { toWindowsCompatiblePath } from '@teambit/toolbox.path.to-windows-compatible-path';

export type ModuleVar = {
  prefix: string;
  paths: string[];
  metadata?: unknown;
};

export function generateComponentLink(modules: ModuleVar[]): string {
  const links = modules.map(({ prefix, paths }) => ({
    name: prefix,
    entries: paths.map((path, idx) => ({
      path: toWindowsCompatiblePath(path),
      linkName: `${prefix}_${idx}`,
    })),
  }));

  // import per preview file
  const importStr: string = links
    .map(({ entries }) => entries.map(({ path, linkName }) => `import * as ${linkName} from '${path}'`).join(';\n'))
    .join(';\n');

  // export files group per preview
  const exportsString: string = links
    .map(({ name, entries }) => `export const ${name} = [${entries.map((entry) => entry.linkName).join(', ')}]`)
    .join(';\n');

  const exportsMetadataString: string = modules.filter(mod => mod.metadata).map(mod => `export const ${mod.prefix}_metadata = ${JSON.stringify(mod.metadata)}`).join(';\n');

  return `${importStr};

${exportsString};

${exportsMetadataString};
`;
}
