import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import cloneDeep from 'lodash/cloneDeep';
import isEqual from 'lodash/isEqual';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { Command, CommandOptions } from '@teambit/cli';
import { formatItem, formatSection, formatSuccessSummary, joinSections } from '@teambit/cli';
import { BitError } from '@teambit/bit-error';
import type { AspectData, Component } from '@teambit/component';
import type { ComponentID } from '@teambit/component-id';
import type { ComponentMap } from '@teambit/legacy.bit-map';
import { WORKSPACE_ROOT_DIR } from '@teambit/legacy.bit-map';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import { Extensions } from '@teambit/legacy.constants';
import { pathNormalizeToLinux } from '@teambit/legacy.utils';
import type { Workspace } from '@teambit/workspace';
import { OutsideWorkspaceError, WorkspaceAspect } from '@teambit/workspace';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import { snapToSemver } from '@teambit/component-package-version';
import { configForWorkspaceRoot } from './add-components';
import type { TrackerMain } from './tracker.main.runtime';

export const PNPM_WORKSPACE_MANIFEST = 'pnpm-workspace.yaml';
const PACKAGE_JSON = 'package.json';
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

export type PnpmVcsSyncResult = {
  schemaVersion: 2;
  rootComponent: string;
  components: Array<{ id: string; rootDir: string; files: number }>;
  removedComponents: string[];
};

export type PnpmVcsImportPlan = {
  schemaVersion: 1;
  components: Array<{ id: string; rootDir: string; packageName: string }>;
  catalogs: Array<{
    catalogName: string;
    packageName: string;
    specifier: string;
    componentId?: string;
  }>;
};

export type PnpmVcsCatalogBinding = {
  catalogName: string;
  packageName: string;
  specifier: string | null;
};

type PnpmVcsCatalogBindingsData = {
  schemaVersion: 1;
  bindings: PnpmVcsCatalogBinding[];
};

type SyncFlags = Record<string, never>;

export class PnpmSyncCmd implements Command {
  name = 'sync';
  description = 'discover pnpm workspace projects and synchronize them with Bit components';
  extendedDescription = `tracks every project "${PNPM_WORKSPACE_MANIFEST}" lists as a component, and the workspace root as the
workspace-root component. package.json and the lockfile are tracked as source (trackAllFiles).
safe to re-run: tracked projects keep their ids, new ones are added, and the ones that left the workspace are removed.`;
  group = 'workspace-setup';
  loader = true;
  options = [['j', 'json', 'return the synchronization result in JSON format']] as CommandOptions;

  constructor(
    private workspace: Workspace,
    private tracker: TrackerMain
  ) {}

  async report(args: string[], flags: SyncFlags): Promise<string> {
    const result = await this.json(args, flags);
    const synced = formatSection(
      'synchronized components',
      '',
      result.components.map(({ id, rootDir }) => formatItem(`${id} (${rootDir})`))
    );
    const removed = result.removedComponents.length
      ? formatSection(
          'removed components',
          'their projects left the pnpm workspace',
          result.removedComponents.map((id) => formatItem(id))
        )
      : '';
    const summary = formatSuccessSummary(`synchronized ${result.components.length} pnpm workspace components`);
    return joinSections([synced, removed, summary]);
  }

  async json(_args: string[], _flags: SyncFlags): Promise<PnpmVcsSyncResult> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    const result = await syncPnpmWorkspace(this.workspace, this.tracker);
    await this.workspace.consumer.onDestroy('pnpm-sync');
    return result;
  }
}

export class PnpmCmd implements Command {
  name = 'pnpm [sub-command]';
  description = 'adopt and maintain a raw pnpm workspace with Bit';
  group = 'workspace-setup';
  loader = true;
  options = [['j', 'json', 'return the synchronization result in JSON format']] as CommandOptions;
  commands: Command[] = [];

  constructor(private syncCmd: PnpmSyncCmd) {}

  report(args: string[], flags: SyncFlags): Promise<string> {
    return this.syncCmd.report(args, flags);
  }

  json(args: string[], flags: SyncFlags): Promise<PnpmVcsSyncResult> {
    return this.syncCmd.json(args, flags);
  }
}

type PnpmWorkspaceManifest = {
  packages?: string[];
  catalog?: Record<string, string>;
  catalogs?: Record<string, Record<string, string>>;
};

type PackageManifest = { name?: string };

type PnpmProject = {
  rootDir: string;
  componentName: string;
  packageName?: string;
};

/**
 * a pnpm workspace adopted by "bit pnpm sync": the workspace root is tracked as a component, and the
 * pnpm manifest sits next to it.
 */
export function isPnpmWorkspace(workspace: Workspace): boolean {
  return (
    Boolean(workspace.consumer.bitMap.getComponentIdByRootPath(WORKSPACE_ROOT_DIR)) &&
    fs.existsSync(path.join(workspace.path, PNPM_WORKSPACE_MANIFEST))
  );
}

/**
 * tracks every project of the pnpm workspace as a component and the workspace root as the
 * workspace-root component. the files of each come from its directory, like any other component:
 * a project's directory is subtracted from the root's file-set because it is tracked on its own.
 *
 * re-running is safe. a project tracked already keeps its id - even when its package was renamed
 * since, the id is anchored to the directory - and only has its config refreshed.
 */
export async function syncPnpmWorkspace(workspace: Workspace, tracker: TrackerMain): Promise<PnpmVcsSyncResult> {
  const workspaceManifestPath = path.join(workspace.path, PNPM_WORKSPACE_MANIFEST);
  if (!(await fs.pathExists(workspaceManifestPath))) {
    throw new BitError(`unable to find ${PNPM_WORKSPACE_MANIFEST} in ${workspace.path}`);
  }
  const workspaceManifest = await readPnpmWorkspaceManifest(workspaceManifestPath);
  const projects = await discoverPnpmProjects(workspace.path, workspaceManifest.packages || []);
  // everything that can fail on the inventory alone fails before anything is written
  throwForNestedProjects(projects);
  assertUnique(
    projects.map((project) => project.componentName),
    'component name'
  );
  await enableTrackAllFiles(workspace);

  const removedComponents = removeLeftProjects(workspace, new Set(projects.map((project) => project.rootDir)));
  const components: PnpmVcsSyncResult['components'] = [];
  for (const project of projects) {
    const componentId = await trackPnpmProject(workspace, tracker, project);
    components.push(syncedComponent(workspace, componentId, project.rootDir));
  }
  const rootId = await trackPnpmWorkspaceRoot(workspace, tracker);
  components.push(syncedComponent(workspace, rootId, WORKSPACE_ROOT_DIR));

  return {
    schemaVersion: 2,
    rootComponent: rootId.toStringWithoutVersion(),
    components,
    removedComponents,
  };
}

async function discoverPnpmProjects(workspacePath: string, patterns: string[]): Promise<PnpmProject[]> {
  const manifestFiles = await discoverPnpmProjectManifests(workspacePath, patterns);
  return Promise.all(
    manifestFiles.map(async (manifestFile) => {
      const rootDir = pathNormalizeToLinux(path.dirname(manifestFile));
      const { name } = await readPackageManifest(path.join(workspacePath, manifestFile));
      const packageName = typeof name === 'string' && name ? name : undefined;
      return { rootDir, componentName: sanitizePnpmComponentName(packageName || rootDir), packageName };
    })
  );
}

/**
 * a component owns its whole directory, so one inside another is only possible for the workspace root.
 * pnpm allows a project inside another one; such a workspace cannot be synced as is.
 */
function throwForNestedProjects(projects: PnpmProject[]) {
  projects.forEach((project) => {
    const parent = projects.find((other) => project.rootDir.startsWith(`${other.rootDir}/`));
    if (!parent) return;
    throw new BitError(
      `unable to sync the pnpm workspace, the project at "${project.rootDir}" is inside the project at "${parent.rootDir}". a component cannot contain another one, except for the workspace root`
    );
  });
}

/**
 * package.json, the lockfile and the rest of what bit generates in a regular workspace are the
 * user's own in a pnpm workspace, so they are tracked as source. set on the loaded config as well:
 * the components tracked right after scan with it.
 */
async function enableTrackAllFiles(workspace: Workspace) {
  const consumer = workspace.consumer;
  if (consumer.config.trackAllFiles) return;
  const workspaceConfig = workspace.getWorkspaceConfig();
  workspaceConfig.setExtension(
    WorkspaceAspect.id,
    { trackAllFiles: true },
    { mergeIntoExisting: true, ignoreVersion: true }
  );
  await workspaceConfig.write({ reasonForChange: 'pnpm sync' });
  consumer.config.trackAllFiles = true;
  consumer.bitMap.trackAllFiles = true;
}

async function trackPnpmProject(workspace: Workspace, tracker: TrackerMain, project: PnpmProject) {
  // the map holds the entries of every lane at once, so a directory is looked up regardless of the lane
  const existingId = workspace.consumer.bitMap.getComponentIdByRootPath(project.rootDir);
  const componentId =
    existingId ??
    (
      await tracker.track({
        rootDir: project.rootDir,
        componentName: project.componentName,
        // absolute: a relative main file is resolved from the cwd, which is not the project's directory
        mainFile: path.join(workspace.path, project.rootDir, PACKAGE_JSON),
      })
    ).componentId;
  // a project that left the workspace and came back is no longer removed
  workspace.bitMap.removeComponentConfig(componentId, Extensions.remove, false);
  addEmptyEnvIfUnset(workspace, componentId);
  if (project.packageName) {
    workspace.bitMap.addComponentConfig(
      componentId,
      DependencyResolverAspect.id,
      { packageName: project.packageName },
      true
    );
  }
  return componentId;
}

async function trackPnpmWorkspaceRoot(workspace: Workspace, tracker: TrackerMain): Promise<ComponentID> {
  const existingId = workspace.consumer.bitMap.getComponentIdByRootPath(WORKSPACE_ROOT_DIR);
  if (existingId) return existingId;
  const rootManifestPath = path.join(workspace.path, PACKAGE_JSON);
  const rootManifest = (await fs.pathExists(rootManifestPath))
    ? await readPackageManifest(rootManifestPath)
    : undefined;
  const rootName = sanitizePnpmComponentName(rootManifest?.name || path.basename(workspace.path));
  const { componentId } = await tracker.track({
    rootDir: WORKSPACE_ROOT_DIR,
    root: true,
    componentName: `${rootName}-workspace`,
    mainFile: path.join(workspace.path, rootManifest ? PACKAGE_JSON : PNPM_WORKSPACE_MANIFEST),
  });
  return componentId;
}

/**
 * a project builds and tests through its own package scripts, not through a bit env, so it gets the
 * empty env - the one the workspace root gets. an env the user configured stays.
 */
function addEmptyEnvIfUnset(workspace: Workspace, componentId: ComponentID) {
  const componentMap = getComponentMap(workspace, componentId);
  if (componentMap.config?.[Extensions.envs]) return;
  // the env aspect and the env selection, both objects - never the "-" of a removed aspect
  Object.entries(configForWorkspaceRoot()).forEach(([aspectId, config]) =>
    workspace.bitMap.addComponentConfig(componentId, aspectId, config as Record<string, any>)
  );
}

/**
 * the components of the projects that left the pnpm workspace: tracked by an earlier sync, which is
 * what the package-name config tells - nothing else sets it - and no longer listed. a component that
 * was never snapped is untracked; a snapped one is marked removed, the way "bit delete" marks it, so
 * the removal is recorded on the next snap.
 */
function removeLeftProjects(workspace: Workspace, projectRootDirs: Set<string>): string[] {
  const bitMap = workspace.consumer.bitMap;
  const leftProjects = bitMap.components.filter((componentMap) => {
    if (componentMap.rootDir === WORKSPACE_ROOT_DIR || projectRootDirs.has(componentMap.rootDir)) return false;
    if (componentMap.isRemoved()) return false;
    const dependencyResolverConfig = componentMap.config?.[DependencyResolverAspect.id];
    return Boolean(
      dependencyResolverConfig && dependencyResolverConfig !== '-' && dependencyResolverConfig.packageName
    );
  });
  leftProjects.forEach((componentMap) => {
    if (componentMap.id.hasVersion()) {
      workspace.bitMap.addComponentConfig(componentMap.id, Extensions.remove, { removed: true });
    } else {
      bitMap.removeComponent(componentMap.id);
    }
  });
  return leftProjects.map((componentMap) => componentMap.id.toStringWithoutVersion());
}

function getComponentMap(workspace: Workspace, componentId: ComponentID): ComponentMap {
  return workspace.consumer.bitMap.getComponent(componentId, { ignoreVersion: true });
}

function syncedComponent(workspace: Workspace, componentId: ComponentID, rootDir: string) {
  const { files } = getComponentMap(workspace, componentId);
  return { id: componentId.toStringWithoutVersion(), rootDir, files: files.length };
}

/**
 * Reconcile the pnpm workspace after Bit writes imported components: a directory no pattern of the
 * manifest covers is added to its packages, and a catalog entry an imported component refers to
 * resolves through the workspace when its package is present, and through the exact snapped package
 * version when it is not. only the pnpm manifest is edited, and only when something changed - a
 * clone restores the versioned one as is. the packages' own manifests are the user's, never rewritten.
 */
export async function applyPnpmImportPlan(workspacePath: string, plan: PnpmVcsImportPlan): Promise<void> {
  const manifestPath = path.join(workspacePath, PNPM_WORKSPACE_MANIFEST);
  const manifest = await readPnpmWorkspaceManifest(manifestPath);
  const originalManifest = cloneDeep(manifest);

  const coveredRootDirs = new Set(
    (await discoverPnpmProjectManifests(workspacePath, manifest.packages || [])).map((manifestFile) =>
      path.posix.dirname(manifestFile)
    )
  );
  const uncoveredRootDirs = plan.components.map(({ rootDir }) => rootDir).filter((dir) => !coveredRootDirs.has(dir));
  if (uncoveredRootDirs.length) manifest.packages = [...(manifest.packages || []), ...uncoveredRootDirs];

  const manifestFiles = await discoverPnpmProjectManifests(workspacePath, manifest.packages || []);
  const localPackageNames = new Set<string>();
  await Promise.all(
    manifestFiles.map(async (manifestFile) => {
      const projectManifest = await readPackageManifest(path.join(workspacePath, manifestFile));
      if (projectManifest.name) localPackageNames.add(projectManifest.name);
    })
  );
  const importedPackageNames = new Set(plan.components.map(({ packageName }) => packageName));
  const catalogOf = (catalogName: string): Record<string, string> => {
    if (catalogName === 'default' && (manifest.catalog || !manifest.catalogs?.default)) {
      return (manifest.catalog ||= {});
    }
    manifest.catalogs ||= {};
    return (manifest.catalogs[catalogName] ||= {});
  };
  [manifest.catalog, ...Object.values(manifest.catalogs || {})].forEach((catalog) => {
    importedPackageNames.forEach((packageName) => {
      if (catalog?.[packageName]) catalog[packageName] = 'workspace:*';
    });
  });
  plan.catalogs.forEach(({ catalogName, packageName, specifier }) => {
    catalogOf(catalogName)[packageName] = localPackageNames.has(packageName) ? 'workspace:*' : specifier;
  });

  if (isEqual(manifest, originalManifest)) return;
  await fs.writeFile(manifestPath, stringifyYaml(manifest));
}

async function readPnpmWorkspaceManifest(manifestPath: string): Promise<PnpmWorkspaceManifest> {
  try {
    const manifest = parseYaml(await fs.readFile(manifestPath, 'utf8'));
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      throw new Error('the document root must be a mapping');
    }
    return manifest as PnpmWorkspaceManifest;
  } catch (error: any) {
    throw new BitError(`unable to read ${manifestPath}: ${error.message}`);
  }
}

export async function discoverPnpmProjectManifests(workspacePath: string, patterns: string[]): Promise<string[]> {
  const positive = patterns.filter((pattern) => !pattern.startsWith('!'));
  const negative = patterns
    .filter((pattern) => pattern.startsWith('!'))
    .map((pattern) => `${pattern.slice(1).replace(/\/$/, '')}/${PACKAGE_JSON}`);
  const discovered = new Set<string>();
  await Promise.all(
    positive.map(async (pattern) => {
      const manifestPattern = `${pattern.replace(/\/$/, '')}/${PACKAGE_JSON}`;
      const matches = await glob(manifestPattern, {
        cwd: workspacePath,
        nodir: true,
        dot: true,
        follow: false,
        ignore: ['**/node_modules/**', ...negative],
      });
      matches.forEach((match) => discovered.add(pathNormalizeToLinux(match)));
    })
  );
  return [...discovered].filter((manifest) => manifest !== PACKAGE_JSON).sort();
}

async function readPackageManifest(manifestPath: string): Promise<PackageManifest> {
  try {
    return JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch (error: any) {
    throw new BitError(`unable to read ${manifestPath}: ${error.message}`);
  }
}

export function sanitizePnpmComponentName(name: string): string {
  const normalized = name
    .replace(/^@/, '')
    .toLowerCase()
    .split('/')
    .map((part) => part.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean)
    .join('/');
  if (!normalized) throw new BitError(`unable to derive a Bit component name from package name ${name}`);
  return normalized;
}

/**
 * Calculate only the catalog entries referenced by this component. This data
 * is persisted with the component version by the tracker on-load hook, making
 * a root catalog edit visible as a change of each affected component without
 * making every catalog consumer depend on the complete workspace catalog.
 */
export function resolvePnpmVcsCatalogBindings(
  packageManifest: unknown,
  workspaceManifest: unknown
): PnpmVcsCatalogBinding[] {
  const references = collectCatalogReferences(packageManifest);
  const workspace = asRecord(workspaceManifest);
  const defaultCatalog = asRecord(workspace.catalog);
  const namedCatalogs = asRecord(workspace.catalogs);
  const bindings = references.map(({ catalogName, packageName }) => {
    const catalog =
      catalogName === 'default'
        ? Object.keys(defaultCatalog).length
          ? defaultCatalog
          : asRecord(namedCatalogs.default)
        : asRecord(namedCatalogs[catalogName]);
    const rawSpecifier = catalog[packageName];
    return {
      catalogName,
      packageName,
      specifier:
        typeof rawSpecifier === 'string'
          ? rawSpecifier
          : rawSpecifier === undefined
            ? null
            : (JSON.stringify(rawSpecifier) ?? null),
    };
  });
  return bindings.sort((left, right) =>
    `${left.catalogName}\0${left.packageName}`.localeCompare(`${right.catalogName}\0${right.packageName}`)
  );
}

function collectCatalogReferences(packageManifest: unknown): Array<{ catalogName: string; packageName: string }> {
  const manifest = asRecord(packageManifest);
  const references = new Map<string, { catalogName: string; packageName: string }>();
  for (const field of DEPENDENCY_FIELDS) {
    for (const [packageName, rawSpecifier] of Object.entries(asRecord(manifest[field]))) {
      if (typeof rawSpecifier !== 'string' || !rawSpecifier.startsWith('catalog:')) continue;
      const catalogName = rawSpecifier.slice('catalog:'.length) || 'default';
      references.set(`${catalogName}\0${packageName}`, { catalogName, packageName });
    }
  }
  return Array.from(references.values());
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * records on each component the catalog entries its package.json refers to, so editing one of them in
 * the pnpm manifest shows as a change of that component. only a workspace with a pnpm manifest has
 * catalogs to refer to; anywhere else, and for a component with no catalog references, there is
 * nothing to record.
 */
export function createPnpmVcsCatalogBindingsOnLoad(
  workspace: Workspace
): (component: Component) => Promise<AspectData | undefined> {
  const workspaceManifestPath = path.join(workspace.path, PNPM_WORKSPACE_MANIFEST);
  let cachedWorkspaceManifest: { signature: string; manifest: unknown } | undefined;

  const readWorkspaceManifest = async (): Promise<unknown> => {
    const stat = await fs.stat(workspaceManifestPath).catch((error: any) => {
      if (error.code === 'ENOENT') return undefined;
      throw new BitError(`unable to read pnpm workspace manifest ${workspaceManifestPath}: ${error.message}`);
    });
    if (!stat) return undefined;
    const signature = `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
    if (cachedWorkspaceManifest?.signature === signature) return cachedWorkspaceManifest.manifest;
    try {
      const manifest = parseYaml(await fs.readFile(workspaceManifestPath, 'utf8'));
      cachedWorkspaceManifest = { signature, manifest };
      return manifest;
    } catch (error: any) {
      throw new BitError(`unable to parse pnpm workspace manifest ${workspaceManifestPath}: ${error.message}`);
    }
  };

  return async (component: Component): Promise<AspectData | undefined> => {
    const packageJsonFile = component.filesystem.files.find((file) => file.relative === PACKAGE_JSON);
    if (!packageJsonFile) return undefined;
    let packageManifest: unknown;
    try {
      packageManifest = JSON.parse(packageJsonFile.contents.toString());
    } catch {
      // not a manifest this hook can read - e.g. the one bit generates, which opens with a banner comment.
      // whatever depends on it being valid reports it; it refers to no catalog either way.
      return undefined;
    }
    if (!collectCatalogReferences(packageManifest).length) return undefined;
    const workspaceManifest = await readWorkspaceManifest();
    if (workspaceManifest === undefined) return undefined;
    return {
      pnpmVcsCatalogBindings: {
        schemaVersion: 1,
        bindings: resolvePnpmVcsCatalogBindings(packageManifest, workspaceManifest),
      } satisfies PnpmVcsCatalogBindingsData,
    };
  };
}

/**
 * Describe the pnpm workspace edits needed after Bit has written imported
 * components. The component model is authoritative for the exact dependency
 * version; pnpm decides whether a package is local and may replace it with a
 * workspace binding. Only the imported components that are pnpm packages -
 * the ones carrying a package.json - take part.
 */
export async function createPnpmVcsImportPlan(
  workspace: Workspace,
  dependencyResolver: DependencyResolverMain,
  components: ConsumerComponent[]
): Promise<PnpmVcsImportPlan | undefined> {
  if (!isPnpmWorkspace(workspace)) return undefined;
  // the root carries the workspace's own package.json, but it is not a package of the workspace
  const pnpmComponents = components.filter(
    (component) => findPackageJsonFile(component) && component.componentMap?.rootDir !== WORKSPACE_ROOT_DIR
  );

  const plannedComponents: PnpmVcsImportPlan['components'] = [];
  const catalogBindings = new Map<string, PnpmVcsImportPlan['catalogs'][number]>();
  for (const component of pnpmComponents) {
    const packageName = packageNameFromLegacyComponent(component);
    const componentMap =
      component.componentMap || workspace.consumer.bitMap.getComponentIfExist(component.id, { ignoreVersion: true });
    if (!componentMap?.rootDir) {
      throw new BitError(`unable to determine the workspace directory for imported component ${component.id}`);
    }
    plannedComponents.push({
      id: component.id.toString(),
      rootDir: pathNormalizeToLinux(componentMap.rootDir),
      packageName,
    });
  }

  for (const component of pnpmComponents) {
    const manifest = parseComponentPackageJson(component);
    const dependencies = dependencyResolver.getDependenciesFromLegacyComponent(component, { includeHidden: true });
    for (const field of DEPENDENCY_FIELDS) {
      const entries = manifest[field];
      if (!entries || typeof entries !== 'object' || Array.isArray(entries)) continue;
      for (const [dependencyName, rawSpecifier] of Object.entries(entries)) {
        // a "workspace:" reference resolves through pnpm on its own, there is no catalog entry to bind
        if (typeof rawSpecifier !== 'string' || !rawSpecifier.startsWith('catalog:')) continue;
        const catalogName = rawSpecifier.slice('catalog:'.length) || 'default';
        const dependency = dependencies.findByPkgNameOrCompId(dependencyName);
        // declared in package.json but never imported by the code, so bit recorded no dependency - and no
        // version to bind. the entry stays as the pnpm manifest has it, which is versioned with the root.
        if (!dependency) continue;
        const binding = {
          catalogName,
          packageName: dependencyName,
          specifier: snapToSemver(dependency.version),
          componentId:
            dependency.type === 'component'
              ? dependencies
                  .getComponentDependencies()
                  .find((candidate) => candidate === dependency)
                  ?.componentId.toString()
              : undefined,
        };
        const key = `${catalogName}\0${dependencyName}`;
        const existing = catalogBindings.get(key);
        if (existing && (existing.specifier !== binding.specifier || existing.componentId !== binding.componentId)) {
          throw new BitError(
            `imported components require conflicting ${catalogName} catalog bindings for ${dependencyName}`
          );
        }
        catalogBindings.set(key, binding);
      }
    }
  }

  return {
    schemaVersion: 1,
    components: plannedComponents.sort((left, right) => left.rootDir.localeCompare(right.rootDir)),
    catalogs: Array.from(catalogBindings.values()).sort((left, right) =>
      `${left.catalogName}\0${left.packageName}`.localeCompare(`${right.catalogName}\0${right.packageName}`)
    ),
  };
}

function findPackageJsonFile(component: ConsumerComponent) {
  return component.files.find((file) => file.relative === PACKAGE_JSON);
}

function parseComponentPackageJson(component: ConsumerComponent): Record<string, unknown> {
  const packageJsonFile = findPackageJsonFile(component);
  if (!packageJsonFile) throw new BitError(`pnpm component ${component.id} does not contain package.json`);
  try {
    return JSON.parse(packageJsonFile.contents.toString());
  } catch (error: any) {
    throw new BitError(`unable to read package.json of imported component ${component.id}: ${error.message}`);
  }
}

function packageNameFromLegacyComponent(component: ConsumerComponent): string {
  const { name } = parseComponentPackageJson(component);
  if (typeof name !== 'string' || !name) {
    throw new BitError(`pnpm component ${component.id} must declare a package name`);
  }
  return name;
}

function assertUnique(values: string[], label: string): void {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  if (duplicates.length) throw new BitError(`duplicate pnpm ${label}: ${duplicates[0]}`);
}
