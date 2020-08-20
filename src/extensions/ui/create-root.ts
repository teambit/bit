import { parse } from 'path';

export async function createRoot(extensionsPaths: string[], aspectPaths: string[], rootExtensionName?: string) {
  const rootId = rootExtensionName ? `'${rootExtensionName}'` : '';

  return `
import { Harmony } from '@teambit/harmony';
import UIAspect from './ui.aspect';
${getImportStatements(aspectPaths, 'Aspect')}
${getImportStatements(extensionsPaths, 'Runtime')}

Harmony.load([UIAspect, ${getIdentifiers(aspectPaths, 'Aspect')}], 'ui', {})
  .then((harmony) => {
    harmony
      .run()
      .then(() => {
        const uiExtension = harmony.get('teambit.bit/ui');
        uiExtension.render(${rootId});
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
  return `${parse(path).name.split('.')[0]}${suffix}`;
}
