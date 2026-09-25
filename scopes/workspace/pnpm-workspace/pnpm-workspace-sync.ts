import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import execa from 'execa';
import semver from 'semver';
import cloneDeep from 'lodash/cloneDeep';
import isEqual from 'lodash/isEqual';
import omit from 'lodash/omit';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { Command, CommandOptions } from '@teambit/cli';
import { errorSymbol, formatItem, formatSection, formatSuccessSummary, joinSections } from '@teambit/cli';
import { BitError } from '@teambit/bit-error';
import type { AspectData, Component } from '@teambit/component';
import { ComponentID } from '@teambit/component-id';
import type { ComponentMap } from '@teambit/legacy.bit-map';
import { WORKSPACE_ROOT_DIR } from '@teambit/legacy.bit-map';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import { Extensions } from '@teambit/legacy.constants';
import { pathNormalizeToLinux } from '@teambit/legacy.utils';
import { PackageJsonFile } from '@teambit/component.sources';
import type { Workspace } from '@teambit/workspace';
import { OutsideWorkspaceError, WorkspaceAspect } from '@teambit/workspace';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import { snapToSemver } from '@teambit/component-package-version';
import type { TrackerMain } from '@teambit/tracker';
import { configForWorkspaceRoot, WORKSPACE_ROOT_ENV } from '@teambit/tracker';
import { PnpmWorkspaceAspect } from './pnpm-workspace.aspect';

export const PNPM_WORKSPACE_MANIFEST = 'pnpm-workspace.yaml';
const PACKAGE_JSON = 'package.json';
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
/** the env of a project with scripts to run, unless "--env" names another one. the aspect is the env */
export const PNPM_WORKSPACE_ENV = PnpmWorkspaceAspect.id;
/** the scripts the env runs. a project with none of them has nothing to build, so it gets the empty env */
const ENV_SCRIPTS = ['build', 'test', 'lint'];

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

type SyncFlags = { env?: string };

export type PnpmSyncOptions = {
  /** the env of the projects that have scripts to run. defaults to PNPM_WORKSPACE_ENV */
  env?: string;
};

export class PnpmSyncCmd implements Command {
  name = 'sync';
  description = 'discover pnpm workspace projects and synchronize them with Bit components';
  extendedDescription = `tracks every project "${PNPM_WORKSPACE_MANIFEST}" lists as a component, and the workspace root as the
workspace-root component. package.json and the lockfile are tracked as source (trackAllFiles).
safe to re-run: tracked projects keep their ids, new ones are added, and the ones that left the workspace are removed.`;
  group = 'workspace-setup';
  loader = true;
  options = [
    ['j', 'json', 'return the synchronization result in JSON format'],
    [
      '',
      'env <env-id>',
      `the env of the projects with a build, test or lint script (default: ${PNPM_WORKSPACE_ENV}). the others get the empty env`,
    ],
  ] as CommandOptions;

  constructor(
    private workspace: Workspace | undefined,
    private tracker: TrackerMain
  ) {}

  async report(args: string[], flags: SyncFlags): Promise<string> {
    const result = await this.json(args, flags);
    // the synchronized components are listed by --json only, a large workspace would flood the terminal
    const removed = result.removedComponents.length
      ? formatSection(
          'removed components',
          'their projects left the pnpm workspace',
          result.removedComponents.map((id) => formatItem(id, errorSymbol))
        )
      : '';
    const summary = formatSuccessSummary(`synchronized ${result.components.length} pnpm workspace components`);
    return joinSections([removed, summary]);
  }

  async json(_args: string[], { env }: SyncFlags): Promise<PnpmVcsSyncResult> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    const result = await syncPnpmWorkspace(this.workspace, this.tracker, { env });
    await this.workspace.consumer.onDestroy('pnpm-sync');
    return result;
  }
}

export class PnpmCmd implements Command {
  name = 'pnpm [sub-command]';
  description = 'adopt and maintain a raw pnpm workspace with Bit';
  group = 'workspace-setup';
  loader = true;
  commands: Command[] = [];
  options: CommandOptions;

  constructor(private syncCmd: PnpmSyncCmd) {
    this.options = syncCmd.options;
  }

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

type PackageManifest = { name?: string; scripts?: Record<string, string> };

type PnpmProject = {
  rootDir: string;
  componentName: string;
  packageName?: string;
  /** whether the project has any script the env runs */
  hasScripts: boolean;
};

/**
 * the env "bit env set" would write for the projects that have scripts to run. resolved once, and
 * only when needed: a custom env is configured by its version, which may take asking the remote.
 */
class ProjectEnvResolver {
  private configId?: Promise<string>;

  constructor(
    private workspace: Workspace,
    readonly envId: string
  ) {}

  /** the env's config key, "scope/name@version" for a custom env */
  getConfigId(): Promise<string> {
    this.configId ||= this.workspace.resolveEnvIdWithPotentialVersionForConfig(ComponentID.fromString(this.envId));
    return this.configId;
  }
}

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
export async function syncPnpmWorkspace(
  workspace: Workspace,
  tracker: TrackerMain,
  options: PnpmSyncOptions = {}
): Promise<PnpmVcsSyncResult> {
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
  const envResolver = new ProjectEnvResolver(workspace, options.env || PNPM_WORKSPACE_ENV);
  for (const project of projects) {
    const componentId = await trackPnpmProject(workspace, tracker, project, envResolver);
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
      const { name, scripts } = await readPackageManifest(path.join(workspacePath, manifestFile));
      const packageName = typeof name === 'string' && name ? name : undefined;
      const hasScripts = ENV_SCRIPTS.some((script) => typeof scripts?.[script] === 'string');
      return { rootDir, componentName: sanitizePnpmComponentName(packageName || rootDir), packageName, hasScripts };
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

async function trackPnpmProject(
  workspace: Workspace,
  tracker: TrackerMain,
  project: PnpmProject,
  envResolver: ProjectEnvResolver
) {
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
  const syncedEnv = await setProjectEnv(workspace, componentId, project.hasScripts, envResolver);
  setProjectPackageName(workspace, componentId, project.packageName);
  const marker: PnpmProjectMarker = { pnpmProject: syncedEnv ? { env: syncedEnv } : {} };
  workspace.bitMap.addComponentConfig(componentId, PnpmWorkspaceAspect.id, marker);
  return componentId;
}

/**
 * on every project sync tracks, so a later sync tells its own components - the ones it may untrack or
 * move to another env - from the rest of the workspace. "env" is the env sync assigned the project, which a
 * later sync may replace, unlike an env the user configured.
 */
type PnpmProjectMarker = { pnpmProject: { env?: string } };

function readProjectMarker(componentMap: ComponentMap): PnpmProjectMarker['pnpmProject'] | undefined {
  const trackerConfig = componentMap.config?.[PnpmWorkspaceAspect.id];
  if (!trackerConfig || trackerConfig === '-') return undefined;
  const marker = trackerConfig.pnpmProject;
  return marker && typeof marker === 'object' ? marker : undefined;
}

/** the name the package.json gives, or none when it gives none - a stale name would stay the package's */
function setProjectPackageName(workspace: Workspace, componentId: ComponentID, packageName: string | undefined) {
  if (packageName) {
    workspace.bitMap.addComponentConfig(componentId, DependencyResolverAspect.id, { packageName }, true);
    return;
  }
  const dependencyResolverConfig = getComponentMap(workspace, componentId).config?.[DependencyResolverAspect.id];
  if (!dependencyResolverConfig || dependencyResolverConfig === '-' || !('packageName' in dependencyResolverConfig)) {
    return;
  }
  const rest = omit(dependencyResolverConfig, 'packageName');
  if (Object.keys(rest).length) {
    workspace.bitMap.addComponentConfig(componentId, DependencyResolverAspect.id, rest);
  } else {
    workspace.bitMap.removeComponentConfig(componentId, DependencyResolverAspect.id, false);
  }
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
 * a project builds and tests through its own package scripts: one that has any gets the env that runs
 * them, one that has none gets the empty env - the one the workspace root gets. a re-run moves a
 * project between the two as its scripts change, and to another env given by --env, but an env the
 * user configured stays. returns the env sync assigned, none when the user's env stays.
 */
async function setProjectEnv(
  workspace: Workspace,
  componentId: ComponentID,
  hasScripts: boolean,
  envResolver: ProjectEnvResolver
): Promise<string | undefined> {
  const componentMap = getComponentMap(workspace, componentId);
  const envsConfig = componentMap.config?.[Extensions.envs];
  const currentEnv = envsConfig && envsConfig !== '-' ? envsConfig.env : undefined;
  const previouslySyncedEnv = readProjectMarker(componentMap)?.env;
  const syncedEnvs = [WORKSPACE_ROOT_ENV, envResolver.envId, previouslySyncedEnv];
  if (currentEnv && !syncedEnvs.includes(currentEnv)) return undefined;
  const targetEnv = hasScripts ? envResolver.envId : WORKSPACE_ROOT_ENV;
  if (currentEnv === targetEnv) return targetEnv;
  if (currentEnv) removeEnvConfig(workspace, componentMap, currentEnv);
  if (!hasScripts) {
    // the env aspect and the env selection, both objects - never the "-" of a removed aspect
    Object.entries(configForWorkspaceRoot()).forEach(([aspectId, config]) =>
      workspace.bitMap.addComponentConfig(componentId, aspectId, config as Record<string, any>)
    );
    return targetEnv;
  }
  workspace.bitMap.addComponentConfig(componentId, await envResolver.getConfigId(), {});
  workspace.bitMap.addComponentConfig(componentId, Extensions.envs, { env: targetEnv });
  return targetEnv;
}

/** the env's own entry, with or without a version, and the env selection */
function removeEnvConfig(workspace: Workspace, componentMap: ComponentMap, envId: string) {
  Object.keys(componentMap.config || {})
    .filter((aspectId) => aspectId === envId || aspectId.startsWith(`${envId}@`))
    .forEach((aspectId) => workspace.bitMap.removeComponentConfig(componentMap.id, aspectId, false));
  workspace.bitMap.removeComponentConfig(componentMap.id, Extensions.envs, false);
}

/**
 * the components of the projects that left the pnpm workspace: tracked by an earlier sync, which is
 * what its marker tells, and no longer listed. a component that was never snapped is untracked; a
 * snapped one is marked removed, the way "bit delete" marks it, so the removal is recorded on the
 * next snap.
 */
function removeLeftProjects(workspace: Workspace, projectRootDirs: Set<string>): string[] {
  const bitMap = workspace.consumer.bitMap;
  const leftProjects = bitMap.components.filter((componentMap) => {
    if (componentMap.rootDir === WORKSPACE_ROOT_DIR || projectRootDirs.has(componentMap.rootDir)) return false;
    if (componentMap.isRemoved()) return false;
    return Boolean(readProjectMarker(componentMap));
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
/**
 * pnpm reads a "workspace:" value in a catalog since pnpm/pnpm#14332 (11.26.0 and 12.2.0), and counts it
 * as a workspace dependency in the order of "pnpm -r" and in "--filter <pkg>..." since pnpm/pnpm#15591
 * (11.28.0 and 12.7.0). once an import binds a local package that way, an older pnpm refuses to install
 * the workspace, or builds the dependent before the package it needs.
 */
export const PNPM_WORKSPACE_CATALOGS_RANGE = '>=11.28.0 <12.0.0-0 || >=12.7.0';

export function pnpmSupportsWorkspaceCatalogs(pnpmVersion: string): boolean {
  return semver.satisfies(pnpmVersion, PNPM_WORKSPACE_CATALOGS_RANGE);
}

/** the version of the pnpm the user runs in the workspace, or undefined when there is none to run */
export async function getUserPnpmVersion(workspacePath: string): Promise<string | undefined> {
  try {
    const { stdout } = await execa('pnpm', ['--version'], { cwd: workspacePath });
    return semver.valid(stdout.trim()) || undefined;
  } catch {
    return undefined;
  }
}

/**
 * returns the packages the import bound to "workspace:*" in a catalog, which only a recent pnpm reads
 * (see PNPM_WORKSPACE_CATALOGS_RANGE)
 */
export async function applyPnpmImportPlan(workspacePath: string, plan: PnpmVcsImportPlan): Promise<string[]> {
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

  const localPackageNames = await readLocalPackageNames(workspacePath, manifest.packages || []);
  await bindWorkspaceReferencesToCatalog(workspacePath, plan, localPackageNames);
  const importedPackageNames = new Set(plan.components.map(({ packageName }) => packageName));
  const catalogOf = (catalogName: string): Record<string, string> => {
    if (catalogName === 'default' && (manifest.catalog !== undefined || !manifest.catalogs?.default)) {
      return (manifest.catalog ||= {});
    }
    manifest.catalogs ||= {};
    return (manifest.catalogs[catalogName] ||= {});
  };
  const workspaceBoundPackageNames = new Set<string>();
  [manifest.catalog, ...Object.values(manifest.catalogs || {})].forEach((catalog) => {
    importedPackageNames.forEach((packageName) => {
      if (!catalog?.[packageName]) return;
      catalog[packageName] = 'workspace:*';
      workspaceBoundPackageNames.add(packageName);
    });
  });
  plan.catalogs.forEach(({ catalogName, packageName, specifier }) => {
    const isLocal = localPackageNames.has(packageName);
    catalogOf(catalogName)[packageName] = isLocal ? 'workspace:*' : specifier;
    if (isLocal) workspaceBoundPackageNames.add(packageName);
  });

  if (!isEqual(manifest, originalManifest)) await fs.writeFile(manifestPath, stringifyYaml(manifest));
  return [...workspaceBoundPackageNames].sort();
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

async function readLocalPackageNames(workspacePath: string, patterns: string[]): Promise<Set<string>> {
  const manifestFiles = await discoverPnpmProjectManifests(workspacePath, patterns);
  const localPackageNames = new Set<string>();
  await Promise.all(
    manifestFiles.map(async (manifestFile) => {
      const projectManifest = await readPackageManifest(path.join(workspacePath, manifestFile));
      if (projectManifest.name) localPackageNames.add(projectManifest.name);
    })
  );
  return localPackageNames;
}

/**
 * an imported package refers to a sibling by "workspace:", which only resolves when the sibling is in
 * this workspace too. the plan binds only the siblings that are not (see createPnpmVcsImportPlan), and
 * those references become "catalog:", so the catalog decides: the exact version now, "workspace:*" once
 * the sibling is imported as well.
 */
async function bindWorkspaceReferencesToCatalog(
  workspacePath: string,
  plan: PnpmVcsImportPlan,
  localPackageNames: Set<string>
): Promise<void> {
  const boundPackageNames = new Set(
    plan.catalogs
      .filter(({ catalogName, packageName }) => catalogName === 'default' && !localPackageNames.has(packageName))
      .map(({ packageName }) => packageName)
  );
  if (!boundPackageNames.size) return;
  await Promise.all(
    plan.components.map(async ({ rootDir }) => {
      // the file is the user's source, so it is written back with the indentation and newlines it has
      const packageJsonFile = await PackageJsonFile.load(workspacePath, rootDir);
      if (!packageJsonFile.fileExist) return;
      const packageManifest = packageJsonFile.packageJsonObject;
      let changed = false;
      for (const field of DEPENDENCY_FIELDS) {
        const dependencies = packageManifest[field] as Record<string, string> | undefined;
        Object.entries(dependencies || {}).forEach(([packageName, specifier]) => {
          if (typeof specifier !== 'string' || !specifier.startsWith('workspace:')) return;
          if (!boundPackageNames.has(packageName)) return;
          dependencies![packageName] = 'catalog:';
          changed = true;
        });
      }
      if (changed) await packageJsonFile.write();
    })
  );
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
  const namedCatalogs = asRecord(workspace.catalogs);
  // pnpm reads "catalog" and "catalogs.default" as one catalog. the top-level one wins when present, the
  // way applyPnpmImportPlan writes it
  const defaultCatalog =
    workspace.catalog !== undefined ? asRecord(workspace.catalog) : asRecord(namedCatalogs.default);
  const bindings = references.map(({ catalogName, packageName }) => {
    const catalog = catalogName === 'default' ? defaultCatalog : asRecord(namedCatalogs[catalogName]);
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

  const workspaceManifest = await readPnpmWorkspaceManifest(path.join(workspace.path, PNPM_WORKSPACE_MANIFEST));
  const localPackageNames = await readLocalPackageNames(workspace.path, workspaceManifest.packages || []);
  plannedComponents.forEach(({ packageName }) => localPackageNames.add(packageName));

  for (const component of pnpmComponents) {
    const manifest = parseComponentPackageJson(component);
    const dependencies = dependencyResolver.getDependenciesFromLegacyComponent(component, { includeHidden: true });
    const snappedBindings = readSnappedCatalogBindings(component);
    const targetBindings = resolvePnpmVcsCatalogBindings(manifest, workspaceManifest);
    for (const field of DEPENDENCY_FIELDS) {
      const entries = manifest[field];
      if (!entries || typeof entries !== 'object' || Array.isArray(entries)) continue;
      for (const [dependencyName, rawSpecifier] of Object.entries(entries)) {
        if (typeof rawSpecifier !== 'string') continue;
        const isWorkspaceReference = rawSpecifier.startsWith('workspace:');
        if (!isWorkspaceReference && !rawSpecifier.startsWith('catalog:')) continue;
        // a "workspace:" reference to a package this workspace has resolves through pnpm on its own
        if (isWorkspaceReference && localPackageNames.has(dependencyName)) continue;
        const catalogName = isWorkspaceReference ? 'default' : rawSpecifier.slice('catalog:'.length) || 'default';
        const dependency = dependencies.findByPkgNameOrCompId(dependencyName);
        // declared in package.json but never imported by the code, so bit recorded no dependency - and no
        // version to bind. the entry stays as this workspace's catalog has it. a catalog without it - the
        // component came from another workspace - gets the range the component was snapped with.
        if (!dependency) {
          if (isWorkspaceReference) continue;
          const findBinding = (bindings: PnpmVcsCatalogBinding[]) =>
            bindings.find(
              (candidate) => candidate.catalogName === catalogName && candidate.packageName === dependencyName
            );
          const snappedSpecifier = findBinding(snappedBindings)?.specifier;
          if (
            findBinding(targetBindings)?.specifier ||
            !snappedSpecifier ||
            snappedSpecifier.startsWith('workspace:')
          ) {
            continue;
          }
          setCatalogBinding(catalogBindings, { catalogName, packageName: dependencyName, specifier: snappedSpecifier });
          continue;
        }
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
        setCatalogBinding(catalogBindings, binding);
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

type PlannedCatalogBinding = PnpmVcsImportPlan['catalogs'][number];

function setCatalogBinding(catalogBindings: Map<string, PlannedCatalogBinding>, binding: PlannedCatalogBinding) {
  const key = `${binding.catalogName}\0${binding.packageName}`;
  const existing = catalogBindings.get(key);
  if (existing && (existing.specifier !== binding.specifier || existing.componentId !== binding.componentId)) {
    throw new BitError(
      `imported components require conflicting ${binding.catalogName} catalog bindings for ${binding.packageName}`
    );
  }
  catalogBindings.set(key, binding);
}

/** the catalog entries the component referred to when it was snapped, see createPnpmVcsCatalogBindingsOnLoad */
function readSnappedCatalogBindings(component: ConsumerComponent): PnpmVcsCatalogBinding[] {
  const data = component.extensions.findCoreExtension(PnpmWorkspaceAspect.id)?.data?.pnpmVcsCatalogBindings as
    | PnpmVcsCatalogBindingsData
    | undefined;
  return data?.bindings || [];
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
