import { AspectDefinition } from '@teambit/aspect-loader';
import { toWindowsCompatiblePath } from '@teambit/toolbox.path.to-windows-compatible-path';
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
  const identifiers = getIdentifiers(aspectDefs, 'Aspect');

  const idSetters = getIdSetters(aspectDefs, 'Aspect');
  config['teambit.harmony/bit'] = rootExtensionName;
  // Escaping "'" in case for example in the config you have something like:
  // description: "team's scope"
  const stringifiedConfig = toWindowsCompatiblePath(JSON.stringify(config)).replace(/'/g, "\\'");

  return `
${createImports(aspectDefs)}

const isBrowser = typeof window !== "undefined";
const config = JSON.parse('${stringifiedConfig}');
${idSetters.join('\n')}
export function render(...props){
  return Harmony.load([${identifiers.join(', ')}], '${runtime}', config)
    .then((harmony) => {
      return harmony
      .run()
      .then(() => harmony.get('${rootAspect}'))
      .then((rootExtension) => {
        const ssrSetup = !isBrowser && rootExtension.setupSsr;
        const setup = rootExtension.setup;
        const setupFunc = (ssrSetup || setup || function noop(){}).bind(rootExtension);

        return (
          Promise.resolve(setupFunc())
            .then(() => rootExtension)
        );
      })
      .then((rootExtension) => {
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
${getImportStatements(aspectDefs, 'aspectPath', 'Aspect')}
${getImportStatements(defs, 'runtimePath', 'Runtime')}`;
}

function getImportStatements(aspectDefs: AspectDefinition[], pathProp: string, suffix: string): string {
  return aspectDefs
    .map(
      (aspectDef) =>
        `import ${getIdentifier(aspectDef, suffix)} from '${toWindowsCompatiblePath(aspectDef[pathProp])}';`
    )
    .join('\n');
}

function getIdentifiers(aspectDefs: AspectDefinition[], suffix: string): string[] {
  return aspectDefs.map((aspectDef) => `${getIdentifier(aspectDef, suffix)}`);
}

function getIdSetters(defs: AspectDefinition[], suffix: string) {
  return defs
    .map((def) => {
      if (!def.getId) return undefined;
      return `${getIdentifier(def, suffix)}.id = '${def.getId}';`;
    })
    .filter((val) => !!val);
}

function getIdentifier(aspectDef: AspectDefinition, suffix: string): string {
  if (!aspectDef.component && !aspectDef.local) {
    return getCoreIdentifier(aspectDef.aspectPath, suffix);
  }
  return getRegularAspectIdentifier(aspectDef, suffix);
}

function getRegularAspectIdentifier(aspectDef: AspectDefinition, suffix: string): string {
  return camelCase(`${parse(aspectDef.aspectPath).base.replace(/\./, '__').replace('@', '__')}${suffix}`);
}

function getCoreIdentifier(path: string, suffix: string): string {
  return camelCase(`${parse(path).name.split('.')[0]}${suffix}`);
}
