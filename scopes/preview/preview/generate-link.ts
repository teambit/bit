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
  componentIdString: string;
  componentIdVersion: string;
  componentIdScope: string;
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
    componentIdString: component.id.toStringWithoutVersion(),
    componentIdVersion: component.id.version,
    componentIdScope: component.id.scope,
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
import { linkModules } from '${normalizePath(join(previewDistDir, 'preview-modules.js'))}';

function __bitActiveComponentId() {
  try {
    const { hash } = window.location;
    if (!hash) return null;
    const [idPart] = hash.slice(1).split("?");
    const id = (idPart || "").trim().replace(/^\\/+|\\/+$/g, "");
    return id || null;
  } catch {
    return null;
  }
}
const __bitActiveId = __bitActiveComponentId();

function __bitNormalizeId(id) {
  if (!id) return "";
  return String(id).trim().replace(/^\\/+|\\/+$/g, "");
}

function __bitShouldSurfaceFor(componentId) {
  if (!__bitActiveId) return false;
  const act = __bitNormalizeId(__bitActiveId);
  const cmp = __bitNormalizeId(componentId);
  if (!act || !cmp) return false;
  if (act === cmp) return true;
  return false;
}

// Surface caught errors to the overlay without breaking fallback.
// Only for the active component in this iframe.
function __bitSurfaceToOverlay(err, componentId) {
  if (process.env.NODE_ENV === "production") return;
  if (!__bitShouldSurfaceFor(componentId)) return;
  const e = err instanceof Error ? err : new Error(String(err));
  const msg = (err && err.message) ? err.message : String(err);
  console.error('[preview][load:fail]', componentId, msg);
  setTimeout(() => {
    void Promise.reject(e);
  }, 0);
}

${getModuleImports(moduleLinks, tempPackageDir)}
(async function initializeModules() {
${getComponentImports(componentLinks)}

linkModules('${prefix}', {
  modulesMap: {
    ${moduleLinks.map((m) => `"${m.envId}": ${m.varName}`).join(',\n    ')}
  },
  isSplitComponentBundle: ${isSplitComponentBundle},
  componentMap: {
${componentLinks
  .map((cl) => `    "${cl.componentIdentifier}": [${cl.modules.map((m) => m.varName).join(', ')}]`)
  .join(',\n')}
  }
});
})();
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
    .flatMap((link) => {
      return link.modules.map((module) => {
        return `
          let ${module.varName};
          if (__bitShouldSurfaceFor("${link.componentIdString}")) {
            try {
              ${module.varName} = await import("${module.resolveFrom}");
            } 
            catch (err) {
              const msg = (err && err.message) ? err.message : String(err);
              __bitSurfaceToOverlay(err, "${link.componentIdString}");
              ${module.varName} = { 
                default: function ErrorFallback() { return null; },
                __loadError: err 
              };
            }
          }   
          else {
            // Don't import non-active modules at all
            ${module.varName} = { default: function Placeholder() { return null; } };
        }`;
      });
    })
    .join('\n');
}
