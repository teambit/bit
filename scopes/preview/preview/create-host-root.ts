import { AspectDefinition } from '@teambit/aspect-loader';
import { toWindowsCompatiblePath } from '@teambit/toolbox.path.to-windows-compatible-path';
import { camelCase } from 'lodash';
import { parse } from 'path';

export function createHostRoot(aspectDefs: AspectDefinition[], coreRootPath: string, config = {}) {
  const identifiers = getIdentifiers(aspectDefs, 'Aspect');
  const idSetters = getIdSetters(aspectDefs, 'Aspect');

  return `
${createImports(aspectDefs)}
const config = JSON.parse('${toWindowsCompatiblePath(JSON.stringify(config))}');
${idSetters.join('\n')}

const coreRoot = import('${coreRootPath}').then(coreRoot => {
  const render = coreRoot.render;
  render(config, [${identifiers.join()}]);
});
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

function getIdentifiers(aspectDefs: AspectDefinition[] = [], suffix: string): string[] {
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
