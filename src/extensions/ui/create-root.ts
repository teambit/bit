import { parse } from 'path';

export async function createRoot(extensionsPaths: string[], rootExtensionName?: string) {
  const rootId = rootExtensionName ? `'${rootExtensionName}'` : '';

  return `
import harmony from '@teambit/harmony';
import UIExtension from './ui.ui.runtime';
${getImportStatements(extensionsPaths)}

harmony
  .run([UIExtension, ${getIdentifiers(extensionsPaths)}])
  .then(() => {
    const uiExtension = harmony.get('@teambit/ui');
    uiExtension.render(${rootId});
  })
  .catch((err) => {
    throw err;
  });    
  `;
}

function getImportStatements(extensionPaths: string[]): string {
  return extensionPaths.map((path) => `import ${getIdentifier(path)} from '${path}';`).join('\n');
}

function getIdentifiers(extensionsPaths: string[]): string {
  return extensionsPaths.map((path) => `${getIdentifier(path)}`).join(', ');
}

function getIdentifier(path: string): string {
  return parse(path).name.split('.')[0];
}
