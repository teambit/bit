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
  // The link file is the graph parent of every component module it imports. Accepting
  // those modules here gives non-react-refresh updates a hot boundary: a module whose
  // exports are not all React components (e.g. a composition exporting a live-controls
  // config object) is not a refresh boundary, so its update bubbles up — without this
  // accept it reaches the entry and forces a full page reload. Refresh-boundary modules
  // still self-accept first (state-preserving); this only catches what they can't.
  // In source mode the imports are workspace-relative requests; in dist mode accept the
  // exact specifiers the import() calls use so they resolve to the same modules.
  const acceptedDependencies = Array.from(
    new Set([
      ...componentLinks.flatMap((link) =>
        link.modules.map((module) =>
          useSource ? toWebpackRequestId(module.resolveFrom, workspacePath) : module.resolveFrom
        )
      ),
      ...(useSource && moduleImports.tempFilePath
        ? [toWebpackRequestId(moduleImports.tempFilePath, workspacePath)]
        : []),
    ])
  );

  const sourceModeBootstrap = `
let __bitInitialized = false;
async function __bitMaybeInitialize(force = false, shouldNotify = false) {
  // a deferred thumbnail link stays uninitialized until a hashchange asks for its preview
  if (__bitThumbnailDefer()) return;
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

// The accept/dispose calls must be the literal \`import.meta.webpackHot.accept(...)\`
// member expression: bundlers create the hot-accept dependencies by static analysis
// of exactly that form. Calling through an alias compiles the dependency list into
// plain runtime strings that map to no module id — updates bubble past this file and
// force a full reload.
if (import.meta.webpackHot) {
  import.meta.webpackHot.accept(${JSON.stringify(acceptedDependencies)}, () => {
    __bitInitialized = false;
    void __bitMaybeInitialize(true, true);
  });
  import.meta.webpackHot.dispose(() => {
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
let __bitInitialized = false;
async function __bitInitializeOnce(force = false, shouldNotify = false) {
  if (__bitInitialized && !force) return;
  __bitInitialized = true;
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

// Literal \`import.meta.webpackHot\` member expressions on purpose — see the
// source-mode bootstrap note: an alias breaks the bundler's static hot-accept
// analysis and the dependency list degrades to inert runtime strings.
if (import.meta.webpackHot) {
  import.meta.webpackHot.accept(${JSON.stringify(acceptedDependencies)}, () => {
    __bitInitialized = false;
    void __bitInitializeOnce(true, true);
  });
  import.meta.webpackHot.dispose(() => {
    __bitInitialized = false;
  });
}

if (__bitThumbnailDefer()) {
  // deferred: initialize only if a later hash actually asks for this preview
  window.addEventListener('hashchange', () => {
    if (!__bitThumbnailDefer()) void __bitInitializeOnce();
  });
} else {
  void __bitInitializeOnce();
}
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

// A pooled grid "thumbnail" realm (see preview-canvas.ts) renders exactly one preview type, yet
// every preview's link file evaluates its env template module at boot: the overview template is a
// full docs app, measured at ~250ms of a ~500ms realm boot on a grid that only ever renders
// compositions. When the hash carries thumbnail=true, a link whose preview is not the active one
// defers all module evaluation until a hashchange actually asks for it. Without the marker
// nothing defers, so regular preview pages load exactly what they loaded before.
function __bitThumbnailDefer() {
  try {
    const [, query = ""] = (window.location.hash || "").slice(1).split("?");
    const params = new URLSearchParams(query);
    if (params.get("thumbnail") !== "true") return false;
    const active = params.get("preview");
    if (!active) return false;
    return active !== ${JSON.stringify(prefix)};
  } catch {
    return false;
  }
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

${moduleImports.statement}
async function initializeModules() {
const {${moduleLinks.map((m) => m.varName).join(', ')}} = await __bitLoadMainModules();
${getComponentImports(componentLinks)}
linkModules('${prefix}', {
  modulesMap: {
    ${moduleLinks.map((m) => `"${m.envId}": ${m.varName}`).join(',\n    ')}
  },
  isSplitComponentBundle: ${isSplitComponentBundle},
  componentMap: {
${generateComponentMapEntries(componentLinks)}
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

/**
 * The componentMap is keyed by the component fullName, which carries no scope.
 * Components from different scopes sharing a fullName (e.g. several scopes each
 * exposing a "readme" component, all served by one deduped dev server) would
 * emit duplicate object keys — the last entry silently wins, and since
 * non-active components resolve to a null-rendering Placeholder (see
 * getComponentImports), every other same-named component's preview renders
 * blank with no error. For colliding names, select the active component's
 * modules at runtime via __bitShouldSurfaceFor, falling back to the last entry
 * (which preserves the previous behavior when no component id is active, e.g.
 * in isolated builds).
 */
function generateComponentMapEntries(componentLinks: ComponentLink[] = []): string {
  const byIdentifier = new Map<string, ComponentLink[]>();
  componentLinks.forEach((cl) => {
    const links = byIdentifier.get(cl.componentIdentifier) || [];
    links.push(cl);
    byIdentifier.set(cl.componentIdentifier, links);
  });
  const moduleArr = (cl: ComponentLink) => `[${cl.modules.map((m) => m.varName).join(', ')}]`;
  return Array.from(byIdentifier.entries())
    .map(([identifier, links]) => {
      if (links.length === 1) return `    "${identifier}": ${moduleArr(links[0])}`;
      const conditionals = links
        .map((cl) => `__bitShouldSurfaceFor("${cl.componentIdString}") ? ${moduleArr(cl)} : `)
        .join('');
      return `    "${identifier}": ${conditionals}${moduleArr(links[links.length - 1])}`;
    })
    .join(',\n');
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
    // A lazy loader instead of a static import: the env template modules (the docs app among them)
    // must not evaluate while a thumbnail realm's link is deferred. A true async import also keeps
    // their code out of the *initial* chunk graph, which is what makes it matter: the docs-app chunk
    // alone measured 5.4 MB on the wire, downloaded by every realm that would never run it. Each
    // preview's temp file must form its OWN async chunk - a shared webpackChunkName merged the
    // compositions mounter with the overview docs template, and initializing compositions dragged
    // the whole docs app back in. A grid thumbnail now neither evaluates nor fetches it; a real
    // preview page pays one extra request the first time its template initializes.
    statement: `let __bitMainModulesNs;
async function __bitLoadMainModules() {
  __bitMainModulesNs ??= await import("${normalizePath(tempFilePath)}");
  return __bitMainModulesNs;
}`,
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
            // Not the component this iframe was opened for. Keep it out of the initial load, but
            // hand back a loader instead of a null-rendering placeholder: a realm that renders
            // several previews at once (a workspace grid batching cards into one iframe) needs to
            // pull these in on demand, and normalizeEntries already calls functions. The active
            // component's path above is untouched, so a single-preview iframe loads exactly what it
            // loaded before.
            ${module.varName} = () => import("${module.resolveFrom}").catch((err) => {
              __bitSurfaceToOverlay(err, "${link.componentIdString}");
              return { default: function ErrorFallback() { return null; }, __loadError: err };
            });
        }`;
      });
    })
    .join('\n');
}
