import { AspectDefinition } from '@teambit/aspect-loader';
import { ComponentID } from '@teambit/component-id';
import { toWindowsCompatiblePath } from '@teambit/toolbox.path.to-windows-compatible-path';
import { camelCase } from 'lodash';
import { parse } from 'path';

import { UIAspect } from './ui.aspect';

export async function createRoot(
  aspectDefs: AspectDefinition[],
  rootExtensionName?: string,
  rootAspect = UIAspect.id,
  runtime = 'ui',
  config = {},
  ignoreVersion?: boolean
) {
  const rootId = rootExtensionName ? `'${rootExtensionName}'` : '';
  const identifiers = getIdentifiers(aspectDefs, 'Aspect');

  const idSetters = getIdSetters(aspectDefs, 'Aspect', ignoreVersion);
  config['teambit.harmony/bit'] = rootExtensionName;
  // Escaping "'" in case for example in the config you have something like:
  // description: "team's scope"
  const stringifiedConfig = toWindowsCompatiblePath(JSON.stringify(config)).replace(/'/g, "\\'");

  return `
${createImports(aspectDefs)}

const isBrowser = typeof window !== "undefined";
const windowConfig = isBrowser ? window.harmonyAppConfig: undefined;
const config = JSON.parse('${stringifiedConfig}');
const mergedConfig = { ...config, ...windowConfig };
${idSetters.join('\n')}
export default function render(...props){
  return Harmony.load([${identifiers.join(', ')}], '${runtime}', mergedConfig)
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

if (isBrowser || '${runtime}' === 'main') render();
`;
}

export function createImports(aspectDefs: AspectDefinition[], ignoreHarmony = false): string {
  const defs = aspectDefs.filter((def) => def.runtimePath);

  return `${ignoreHarmony ? '' : "import { Harmony } from '@teambit/harmony';"}
${getImportStatements(aspectDefs, 'aspectFilePath', 'Aspect')}
${getImportStatements(defs, 'runtimePath', 'Runtime')}`;
}

function getImportStatements(aspectDefs: AspectDefinition[], pathProp: string, suffix: string): string {
  return aspectDefs
    .map(
      (aspectDef) =>
        `import ${getIdentifier(aspectDef, suffix, pathProp)} from '${toWindowsCompatiblePath(aspectDef[pathProp])}';`
    )
    .join('\n');
}

export function getIdentifiers(aspectDefs: AspectDefinition[], suffix: string): string[] {
  return aspectDefs.map((aspectDef) => `${getIdentifier(aspectDef, suffix)}`);
}

export function getIdSetters(defs: AspectDefinition[], suffix: string, ignoreVersion?: boolean) {
  return defs
    .map((def) => {
      if (!def.getId) return undefined;
      const id = ComponentID.fromString(def.getId);
      return `${getIdentifier(def, suffix)}.id = '${ignoreVersion ? id.toStringWithoutVersion() : id.toString()}';`;
    })
    .filter((val) => !!val);
}

function getIdentifier(aspectDef: AspectDefinition, suffix: string, pathProp?: string): string {
  if (!aspectDef.component && !aspectDef.local) {
    return getCoreIdentifier(aspectDef.aspectPath, suffix);
  }
  return getRegularAspectIdentifier(aspectDef, suffix, pathProp);
}

function getRegularAspectIdentifier(aspectDef: AspectDefinition, suffix: string, pathProp?: string): string {
  const targetName = camelCase(`${parse(aspectDef.aspectPath).base.replace(/\./, '__').replace('@', '__')}${suffix}`);
  const sourceName = pathProp ? getDefaultOrOnlyExport(aspectDef[pathProp]) : undefined;
  const identifier = sourceName ? `{${sourceName} as ${targetName}}` : targetName;
  return identifier;
}

function getDefaultOrOnlyExport(filePath: string): string | undefined {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const exports = require(filePath);
    if (exports.default) return undefined;
    if (Object.keys(exports).length === 1) return Object.keys(exports)[0];
  } catch (e) {
    // ignore this error, fallback to just using the default export
  }
  return undefined;
}

function getCoreIdentifier(path: string, suffix: string): string {
  return camelCase(`${parse(path).name.split('.')[0]}${suffix}`);
}
