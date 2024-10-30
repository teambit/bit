import type { ComponentMap } from '@teambit/component';
import { join } from 'path';
import { outputFileSync } from 'fs-extra';
import normalizePath from 'normalize-path';
import objectHash from 'object-hash';
import camelcase from 'camelcase';
import { toWindowsCompatiblePath } from '@teambit/toolbox.path.to-windows-compatible-path';
import { getPreviewDistDir } from './mk-temp-dir';

const previewDistDir = getPreviewDistDir();

export type MainModulesMap = {
  /**
   * Path to default module in case there is no specific module for the current environment.
   */
  default: string;
  [envId: string]: string;
};

type ModuleLink = {
  envId: string;
  varName: string;
  resolveFrom: string;
};

type ComponentLink = {
  componentIdentifier: string;
  modules: {
    varName: string;
    resolveFrom: string;
  }[];
};

// :TODO refactor to building an AST and generate source code based on it.
export function generateLink(
  prefix: string,
  componentMap: ComponentMap<string[]>,
  mainModulesMap?: MainModulesMap,
  isSplitComponentBundle = false,
  tempPackageDir?: string
): string {
  const componentLinks: ComponentLink[] = componentMap.toArray().map(([component, modulePath], compIdx) => ({
    componentIdentifier: component.id.fullName,
    modules: modulePath.map((path, pathIdx) => ({
      varName: moduleVarName(compIdx, pathIdx),
      resolveFrom: normalizePath(path),
    })),
  }));

  const moduleLinks: ModuleLink[] = Object.entries(mainModulesMap || {}).map(([envId, path]) => {
    const resolveFrom = normalizePath(path);
    const varName = getEnvVarName(envId);
    return { envId, varName, resolveFrom };
  });

  const contents = `
import { linkModules } from '${normalizePath(join(previewDistDir, 'preview.preview.runtime.js'))}';

${getModuleImports(moduleLinks, tempPackageDir)}

${getComponentImports(componentLinks)}

linkModules('${prefix}', {
  modulesMap: {
    ${moduleLinks
      // must include all components, including empty
      .map((moduleLink) => `"${moduleLink.envId}": ${moduleLink.varName}`)
      .join(',\n    ')}
  },
  isSplitComponentBundle: ${isSplitComponentBundle},
  componentMap: {
${componentLinks
  // must include all components, including empty
  .map(
    (componentLink) =>
      `    "${componentLink.componentIdentifier}": [${componentLink.modules
        .map((module) => module.varName)
        .join(', ')}]`
  )
  .join(',\n')}
  }
});
`;
  return contents;
}

function moduleVarName(componentIdx: number, fileIdx: number) {
  return `file_${componentIdx}_${fileIdx}`;
}

function getEnvVarName(envId: string) {
  const envNameFormatted = camelcase(envId.replace('@', '').replace('.', '-').replace(/\//g, '-'));
  const varName = `${envNameFormatted}MainModule`;
  return varName;
}

function getModuleImports(moduleLinks: ModuleLink[] = [], tempPackageDir?: string): string {
  const hash = objectHash(moduleLinks);
  const tempFileName = `preview-modules-${hash}.mjs`;
  const tempFilePath = toWindowsCompatiblePath(join(tempPackageDir || previewDistDir, tempFileName));
  const tempFileContents = moduleLinks
    .map((module) => `export * as ${module.varName} from "${module.resolveFrom}";`)
    .join('\n');
  outputFileSync(tempFilePath, tempFileContents);
  return `import {${moduleLinks.map((moduleLink) => moduleLink.varName).join(', ')}} from "${normalizePath(
    tempFilePath
  )}";`;
}

function getComponentImports(componentLinks: ComponentLink[] = []): string {
  return componentLinks
    .map((link) =>
      link.modules.map((module) => `import * as ${module.varName} from "${module.resolveFrom}";`).join('\n')
    )
    .filter((line) => line !== '') // prevent empty lines
    .join('\n');
}
