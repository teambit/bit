import { AspectDefinition } from '@teambit/aspect-loader';
import { camelCase } from 'lodash';
import { parse } from 'path';

import { UIAspect } from './ui.aspect';

export async function createRoot(
  aspectDefs: AspectDefinition[],
  rootExtensionName?: string,
  rootAspect = UIAspect.id,
  runtime = 'ui'
) {
  const rootId = rootExtensionName ? `'${rootExtensionName}'` : '';
  const defs = aspectDefs.filter((def) => def.runtimePath);

  return `
import { Harmony } from '@teambit/harmony';
${getImportStatements(
  aspectDefs.map((def) => def.aspectPath),
  'Aspect'
)}
${getImportStatements(
  // @ts-ignore no nulls can be found here - see above.
  defs.map((def) => def.runtimePath),
  'Runtime'
)}

Harmony.load([${getIdentifiers(
    aspectDefs.map((def) => def.aspectPath),
    'Aspect'
  )}], '${runtime}', {})
  .then((harmony) => {
    harmony
      .run()
      .then(() => {
        const rootExtension = harmony.get('${rootAspect}');
        rootExtension.render(${rootId});
      })
      .catch((err) => {
        throw err;
      });
  });
  `;
}

function getImportStatements(extensionPaths: string[], suffix: string): string {
  return extensionPaths.map((path) => `import ${getIdentifier(path, suffix)} from '${path}';`).join('\n');
}

function getIdentifiers(extensionsPaths: string[], suffix: string): string {
  return extensionsPaths.map((path) => `${getIdentifier(path, suffix)}`).join(', ');
}

function getIdentifier(path: string, suffix: string): string {
  return camelCase(`${parse(path).name.split('.')[0]}${suffix}`);
}
