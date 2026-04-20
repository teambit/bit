import type { ComponentMap } from '@teambit/component';
import { join, relative } from 'path';
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
  tempPackageDir?: string,
  workspacePath?: string,
  useSource = false
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
  const moduleImports = getModuleImports(moduleLinks, tempPackageDir);
  const acceptedDependencies = useSource
    ? Array.from(
        new Set([
          ...componentLinks.flatMap((link) =>
            link.modules.map((module) => toWebpackRequestId(module.resolveFrom, workspacePath))
          ),
          ...(moduleImports.tempFilePath ? [toWebpackRequestId(moduleImports.tempFilePath, workspacePath)] : []),
        ])
      )
    : [];

  const sourceModeBootstrap = `
function __bitActivePreviewName() {
  try {
    const { hash } = window.location;
    if (!hash) return null;
    const [, query = ""] = hash.slice(1).split("?");
    const params = new URLSearchParams(query);
    return params.get("preview");
  } catch {
    return null;
  }
}

let __bitInitialized = false;
async function __bitMaybeInitialize(force = false, shouldNotify = false) {
  if (__bitInitialized && !force) return;
  __bitInitialized = true;
  // Always call initializeModules() so linkModules runs for every preview
  // (e.g. 'compositions') — even ones that are not the URL's active preview.
  // This is required because included previews (like 'overview'.include = ['compositions'])
  // gate readiness on PREVIEW_MODULES containing every included preview name.
  // Expensive source imports are still filtered per-component via __bitShouldSurfaceFor.
  await initializeModules();
  if (shouldNotify) {
    // Only the active preview dispatches the update event so unrelated previews
    // don't cause extra rerenders during HMR.
    const activePreview = __bitActivePreviewName();
    if (activePreview === ${JSON.stringify(prefix)}) {
      window.dispatchEvent(
        new CustomEvent('bit-preview-modules-updated', {
          detail: { previewName: ${JSON.stringify(prefix)} },
        })
      );
    }
  }
}

const __bitHot =
  import.meta.webpackHot
  || (typeof module !== 'undefined' && module.hot)
  || undefined;

if (__bitHot) {
  __bitHot.accept(${JSON.stringify(acceptedDependencies)}, () => {
    __bitInitialized = false;
    void __bitMaybeInitialize(true, true);
  });
  __bitHot.dispose(() => {
    __bitInitialized = false;
  });
}

// Defer source-mode initialization until after webpack marks the current entry
// chunk as loaded. Otherwise modules placed in the current entry chunk can be
// resolved as a missing async chunk while the entry is still evaluating.
queueMicrotask(() => {
  void __bitMaybeInitialize();
});
window.addEventListener('hashchange', () => {
  void __bitMaybeInitialize();
});
`;

  const runtimeBootstrap = useSource
    ? sourceModeBootstrap
    : `
(async function initializeModulesOnLoad() {
  await initializeModules();
})();
`;

  const contents = `import { linkModules } from '${normalizePath(join(previewDistDir, 'preview-modules.js'))}';

// strip leading/trailing slashes from any id we compare
function __bitNormalizeId(id) {
  if (!id) return "";
  return String(id).trim().replace(/^\\/+|\\/+$/g, "");
}

function __bitActiveComponentId() {
  try {
    const { hash } = window.location;
    if (!hash) return null;
    const [idPart] = hash.slice(1).split("?");
    const id = __bitNormalizeId(idPart);
    const idWithoutVersion = id.split('@')[0];
    return idWithoutVersion || null;
  } catch {
    return null;
  }
}

const __bitActiveId = __bitActiveComponentId();

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

${moduleImports.statement}
async function initializeModules() {
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
}
${runtimeBootstrap}
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

function toWebpackRequestId(filePath: string, workspacePath?: string): string {
  if (!workspacePath) return filePath;
  const normalizedWorkspacePath = normalizePath(workspacePath);
  const normalizedFilePath = normalizePath(filePath);
  if (normalizedFilePath === normalizedWorkspacePath) return '.';
  if (
    normalizedFilePath.startsWith(`${normalizedWorkspacePath}/`) ||
    normalizedFilePath.startsWith(`${normalizedWorkspacePath}\\`)
  ) {
    const relPath = normalizePath(relative(workspacePath, filePath));
    return relPath.startsWith('.') ? relPath : `./${relPath}`;
  }
  return filePath;
}

function getModuleImports(
  moduleLinks: ModuleLink[] = [],
  tempPackageDir?: string
): {
  statement: string;
  tempFilePath?: string;
} {
  const hash = objectHash(moduleLinks);
  const tempFileName = `preview-modules-${hash}.mjs`;
  const tempFilePath = toWindowsCompatiblePath(join(tempPackageDir || previewDistDir, tempFileName));
  const tempFileContents = moduleLinks
    .map((module) => `export * as ${module.varName} from "${module.resolveFrom}";`)
    .join('\n');
  outputFileSync(tempFilePath, tempFileContents);
  return {
    statement: `import {${moduleLinks.map((moduleLink) => moduleLink.varName).join(', ')}} from "${normalizePath(
      tempFilePath
    )}";`,
    tempFilePath: normalizePath(tempFilePath),
  };
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
