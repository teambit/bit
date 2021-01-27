import { AspectDefinition } from '@teambit/aspect-loader';
import { toWindowsCompatiblePath } from '@teambit/path.to-windows-compatible-path';
import { camelCase } from 'lodash';
import { parse } from 'path';

import { UIAspect } from './ui.aspect';

export async function createRoot(
  aspectDefs: AspectDefinition[],
  rootExtensionName?: string,
  rootAspect = UIAspect.id,
  runtime = 'ui',
  config = {}
) {
  const rootId = rootExtensionName ? `'${rootExtensionName}'` : '';
  const identifiers = getIdentifiers(
    aspectDefs.map((def) => def.aspectPath),
    'Aspect'
  );

  const idSetters = getIdSetters(aspectDefs, 'Aspect');

  return `
${createImports(aspectDefs)}

const isBrowser = typeof window !== "undefined";
const config = JSON.parse('${toWindowsCompatiblePath(JSON.stringify(config))}');
${idSetters.join('\n')}

export function render(...props){
  return Harmony.load([${identifiers.join(', ')}], '${runtime}', config)
    .then((harmony) => {
      return harmony
      .run()
      .then(() => {
        const rootExtension = harmony.get('${rootAspect}');

        if (isBrowser) {
          return rootExtension.render(${rootId}, ...props);
        } else {
          return rootExtension.renderSsr(${rootId}, ...props);
        }
      })
      .catch((err) => {
        throw err;
      });
    });
}

if (isBrowser) render();
`;
}

function createImports(aspectDefs: AspectDefinition[]) {
  const defs = aspectDefs.filter((def) => def.runtimePath);

  return `import { Harmony } from '@teambit/harmony';
${getImportStatements(
  aspectDefs.map((def) => def.aspectPath),
  'Aspect'
)}
${getImportStatements(
  // @ts-ignore no nulls can be found here - see above.
  defs.map((def) => def.runtimePath),
  'Runtime'
)}`;
}

function getImportStatements(extensionPaths: string[], suffix: string): string {
  return extensionPaths
    .map((path) => `import ${getIdentifier(path, suffix)} from '${toWindowsCompatiblePath(path)}';`)
    .join('\n');
}

function getIdentifiers(extensionsPaths: string[], suffix: string): string[] {
  return extensionsPaths.map((path) => `${getIdentifier(path, suffix)}`);
}

function getIdSetters(defs: AspectDefinition[], suffix: string) {
  return defs
    .map((def) => {
      if (!def.getId) return undefined;
      return `${getIdentifier(def.aspectPath, suffix)}.id = '${def.getId}';`;
    })
    .filter((val) => !!val);
}

function getIdentifier(path: string, suffix: string): string {
  return camelCase(`${parse(path).name.split('.')[0]}${suffix}`);
}
