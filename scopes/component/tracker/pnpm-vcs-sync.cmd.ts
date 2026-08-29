import fs from 'fs-extra';
import ignore from 'ignore';
import path from 'path';
import semver from 'semver';
import isEqual from 'lodash/isEqual';
import { glob } from 'glob';
import { parse as parseYaml } from 'yaml';
import type { Command, CommandOptions } from '@teambit/cli';
import { BitError } from '@teambit/bit-error';
import type { AspectData, Component } from '@teambit/component';
import { ComponentID } from '@teambit/component-id';
import { retrieveIgnoreList } from '@teambit/git.modules.ignore-file-reader';
import type { BitMap, ComponentMap, ComponentMapFile } from '@teambit/legacy.bit-map';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import { Extensions } from '@teambit/legacy.constants';
import { pathNormalizeToLinux } from '@teambit/legacy.utils';
import type { Workspace } from '@teambit/workspace';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import { snapToSemver } from '@teambit/component-package-version';
import { TrackerAspect } from './tracker.aspect';

export type WorkspaceTool = {
  implementation: string;
  version: string;
};

export type WorkspaceToolMap = Record<string, WorkspaceTool>;

export type PnpmProjectInventoryItem = {
  rootDir: string;
  componentName: string;
  manifestFile: string;
  requirements?: WorkspaceToolMap;
};

export type PnpmWorkspaceInventory = {
  schemaVersion: 2;
  defaultScope: string;
  rootComponentName: string;
  rootMainFile: string;
  workspaceProfile?: WorkspaceToolMap;
  projects: PnpmProjectInventoryItem[];
};

export type PnpmVcsSyncResult = {
  schemaVersion: 2;
  rootComponent: string;
  workspaceProfile: WorkspaceToolMap;
  updatedComponents: string[];
  components: Array<{ id: string; rootDir: string; files: number }>;
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

type PnpmVcsComponentConfig = {
  schemaVersion: 1;
  requirements: WorkspaceToolMap;
  appliedProfile: WorkspaceToolMap;
};

type StoredComponentConfig = {
  trackerConfig: Record<string, any>;
  pnpmVcs?: PnpmVcsComponentConfig;
  dependencyResolverConfig?: Record<string, any>;
};

type SyncFlags = {
  inventory: string;
};

export class PnpmVcsSyncCmd implements Command {
  name = 'pnpm-vcs-sync';
  description = 'synchronize pnpm workspace projects with Bit components';
  group = 'advanced';
  private = true;
  loader = true;
  options = [
    ['', 'inventory <path>', 'path to a pnpm workspace inventory JSON file'],
    ['j', 'json', 'return the synchronization result in JSON format'],
  ] as CommandOptions;

  constructor(private workspace: Workspace) {}

  async report(args: string[], flags: SyncFlags): Promise<string> {
    const result = await this.json(args, flags);
    return `synchronized ${result.components.length} pnpm workspace components`;
  }

  async json(_args: string[], { inventory: inventoryPath }: SyncFlags): Promise<PnpmVcsSyncResult> {
    if (!inventoryPath) throw new BitError('pnpm-vcs-sync requires --inventory');
    const inventory = await readInventory(inventoryPath);
    const result = await syncPnpmWorkspace(this.workspace, inventory);
    await this.workspace.consumer.onDestroy('pnpm-vcs-sync');
    return result;
  }
}

async function readInventory(inventoryPath: string): Promise<PnpmWorkspaceInventory> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(inventoryPath, 'utf8'));
  } catch (error: any) {
    throw new BitError(`unable to read pnpm workspace inventory: ${error.message}`);
  }
  if (!isInventory(parsed)) {
    throw new BitError('unsupported or invalid pnpm workspace inventory; expected schema version 2');
  }
  return parsed;
}

function isInventory(value: unknown): value is PnpmWorkspaceInventory {
  if (!value || typeof value !== 'object') return false;
  const inventory = value as Partial<PnpmWorkspaceInventory>;
  return (
    inventory.schemaVersion === 2 &&
    typeof inventory.defaultScope === 'string' &&
    typeof inventory.rootComponentName === 'string' &&
    Boolean(inventory.rootComponentName) &&
    typeof inventory.rootMainFile === 'string' &&
    Boolean(inventory.rootMainFile) &&
    (inventory.workspaceProfile === undefined || isWorkspaceToolMap(inventory.workspaceProfile, true)) &&
    Array.isArray(inventory.projects) &&
    inventory.projects.every(
      (project) =>
        project &&
        typeof project.rootDir === 'string' &&
        typeof project.componentName === 'string' &&
        typeof project.manifestFile === 'string' &&
        (project.requirements === undefined || isWorkspaceToolMap(project.requirements, false))
    )
  );
}

function isWorkspaceToolMap(value: unknown, exact: boolean): value is WorkspaceToolMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([slot, tool]) => {
    if (!slot || !tool || typeof tool !== 'object' || Array.isArray(tool)) return false;
    const candidate = tool as Partial<WorkspaceTool>;
    if (!candidate.implementation || !candidate.version) return false;
    return exact ? Boolean(semver.valid(candidate.version)) : Boolean(semver.validRange(candidate.version));
  });
}

export async function syncPnpmWorkspace(
  workspace: Workspace,
  inventory: PnpmWorkspaceInventory
): Promise<PnpmVcsSyncResult> {
  const defaultScope = inventory.defaultScope || workspace.defaultScope;
  if (!defaultScope) throw new BitError('pnpm workspace inventory requires a default Bit scope');
  const projects = inventory.projects.map((project) => ({
    ...project,
    rootDir: validateRelativePath(project.rootDir, 'project root'),
    manifestFile: validateRelativePath(project.manifestFile, 'project manifest'),
  }));
  assertUnique(
    projects.map((project) => project.rootDir),
    'project root'
  );
  assertUnique(
    projects.map((project) => project.componentName),
    'component name'
  );

  const bitMap = workspace.consumer.bitMap;
  const workspaceComponents = await workspace.list();
  const storedConfigs = new Map<string, StoredComponentConfig>();
  workspaceComponents.forEach((component) => {
    const trackerConfig = component.state.aspects.get(TrackerAspect.id)?.config;
    if (!trackerConfig || typeof trackerConfig !== 'object') return;
    storedConfigs.set(component.id.toStringWithoutVersion(), {
      trackerConfig,
      pnpmVcs: readPnpmVcsConfig(trackerConfig.pnpmVcs),
      dependencyResolverConfig: component.state.aspects.get(DependencyResolverAspect.id)?.config,
    });
  });
  const existingRoot = bitMap.components.find((component) => !component.rootDir && component.useExplicitFiles);
  const storedRootConfig = existingRoot
    ? storedConfigs.get(existingRoot.id.toStringWithoutVersion())?.pnpmVcs
    : undefined;
  const workspaceProfile = inventory.workspaceProfile ?? storedRootConfig?.appliedProfile ?? {};
  validateWorkspaceProfile(workspaceProfile);

  const projectConfigs = new Map<string, PnpmVcsComponentConfig>();
  projects.forEach((project) => {
    const existing = bitMap.components.find((component) => component.rootDir === project.rootDir);
    const stored = existing ? storedConfigs.get(existing.id.toStringWithoutVersion())?.pnpmVcs : undefined;
    const requirements = project.requirements ?? stored?.requirements ?? requirementsForProfile(workspaceProfile);
    validateWorkspaceRequirements(workspaceProfile, requirements, project.rootDir);
    projectConfigs.set(project.rootDir, {
      schemaVersion: 1,
      requirements,
      appliedProfile: workspaceProfile,
    });
  });

  const ignored = ignore().add([
    ...(await retrieveIgnoreList(workspace.path)),
    ...(workspace.consumer.config.ignoredFiles || []),
    '.bit/**',
    '.bitmap',
    '.git/**',
  ]);
  const allFiles = ignored
    .filter(
      await glob('**/*', {
        cwd: workspace.path,
        nodir: true,
        dot: true,
        follow: false,
      })
    )
    .sort();
  const { rootsByDepth, filesByRoot, rootFiles } = assignFilesToProjects(allFiles, projects);

  const synced: PnpmVcsSyncResult['components'] = [];
  const updatedComponents: string[] = [];
  const currentProjectRoots = new Set(projects.map((project) => project.rootDir));
  bitMap.components
    .filter(
      (component) => component.useExplicitFiles && component.rootDir && !currentProjectRoots.has(component.rootDir)
    )
    .forEach((component) => {
      workspace.bitMap.addComponentConfig(component.id, Extensions.remove, { removed: true });
    });
  for (const project of rootsByDepth) {
    const files = filesByRoot.get(project.rootDir) || [];
    if (!files.includes(project.manifestFile)) {
      throw new BitError(
        `pnpm project ${project.rootDir} does not contain its manifest ${project.manifestFile} in the tracked file set`
      );
    }
    const existing = bitMap.components.find((component) => component.rootDir === project.rootDir);
    const componentMap = addOrUpdateComponent(
      bitMap,
      existing,
      project.componentName,
      defaultScope,
      project.manifestFile,
      files,
      project.rootDir
    );
    const stored = storedConfigs.get(componentMap.id.toStringWithoutVersion());
    const pnpmVcsConfig = projectConfigs.get(project.rootDir)!;
    addPnpmVcsConfig(workspace, componentMap, stored?.trackerConfig, pnpmVcsConfig);
    const packageName = await readProjectPackageName(workspace.path, project);
    addPackageNameConfig(workspace, componentMap, stored?.dependencyResolverConfig, packageName);
    if (stored?.pnpmVcs && !isEqual(stored.pnpmVcs.appliedProfile, workspaceProfile)) {
      updatedComponents.push(componentMap.id.toStringWithoutVersion());
    }
    synced.push({ id: componentMap.id.toStringWithoutVersion(), rootDir: project.rootDir, files: files.length });
  }

  const rootMainFile = validateRelativePath(inventory.rootMainFile, 'root main file');
  if (!rootFiles.includes(rootMainFile)) {
    throw new BitError(`root component does not contain its main file ${rootMainFile} in the tracked file set`);
  }
  // The root package name may change over time. Its component identity, like a
  // project's identity, is anchored to its ownership location rather than the
  // latest package.json name.
  const rootComponent = addOrUpdateComponent(
    bitMap,
    existingRoot,
    inventory.rootComponentName,
    defaultScope,
    rootMainFile,
    rootFiles
  );
  addPnpmVcsConfig(
    workspace,
    rootComponent,
    storedConfigs.get(rootComponent.id.toStringWithoutVersion())?.trackerConfig,
    {
      schemaVersion: 1,
      requirements: requirementsForProfile(workspaceProfile),
      appliedProfile: workspaceProfile,
    }
  );
  synced.push({ id: rootComponent.id.toStringWithoutVersion(), rootDir: '.', files: rootFiles.length });

  return {
    schemaVersion: 2,
    rootComponent: rootComponent.id.toStringWithoutVersion(),
    workspaceProfile,
    updatedComponents,
    components: synced,
  };
}

async function readProjectPackageName(
  workspacePath: string,
  project: Pick<PnpmProjectInventoryItem, 'rootDir' | 'manifestFile'>
): Promise<string> {
  const manifestPath = path.join(workspacePath, project.rootDir, project.manifestFile);
  let manifest: unknown;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch (error: any) {
    throw new BitError(`unable to read pnpm project manifest ${manifestPath}: ${error.message}`);
  }
  const packageName = (manifest as { name?: unknown })?.name;
  if (typeof packageName !== 'string' || !packageName) {
    throw new BitError(`pnpm project ${project.rootDir} must declare a package name`);
  }
  return packageName;
}

function readPnpmVcsConfig(value: unknown): PnpmVcsComponentConfig | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const config = value as Partial<PnpmVcsComponentConfig>;
  if (
    config.schemaVersion !== 1 ||
    !isWorkspaceToolMap(config.requirements, false) ||
    !isWorkspaceToolMap(config.appliedProfile, true)
  ) {
    return undefined;
  }
  return config as PnpmVcsComponentConfig;
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
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
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

export function createPnpmVcsCatalogBindingsOnLoad(
  workspace: Workspace
): (component: Component) => Promise<AspectData | undefined> {
  const workspaceManifestPath = path.join(workspace.path, 'pnpm-workspace.yaml');
  let cachedWorkspaceManifest: { signature: string; manifest: unknown } | undefined;

  const readWorkspaceManifest = async (): Promise<unknown> => {
    const stat = await fs.stat(workspaceManifestPath).catch((error: any) => {
      throw new BitError(`unable to read pnpm workspace manifest ${workspaceManifestPath}: ${error.message}`);
    });
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
    const trackerEntry = component.state.aspects.get(TrackerAspect.id);
    if (!readPnpmVcsConfig(trackerEntry?.config?.pnpmVcs)) return undefined;
    const existingData = trackerEntry?.data?.pnpmVcsCatalogBindings;
    const packageJsonFile = component.filesystem.files.find((file) => file.relative === 'package.json');
    if (!packageJsonFile) {
      return existingData === undefined
        ? undefined
        : { pnpmVcsCatalogBindings: { schemaVersion: 1, bindings: [] } satisfies PnpmVcsCatalogBindingsData };
    }

    let packageManifest: unknown;
    try {
      packageManifest = JSON.parse(packageJsonFile.contents.toString());
    } catch (error: any) {
      throw new BitError(`unable to parse package.json of pnpm VCS component ${component.id}: ${error.message}`);
    }
    const references = collectCatalogReferences(packageManifest);
    if (!references.length && existingData === undefined) return undefined;
    const bindings = references.length
      ? resolvePnpmVcsCatalogBindings(packageManifest, await readWorkspaceManifest())
      : [];
    return {
      pnpmVcsCatalogBindings: {
        schemaVersion: 1,
        bindings,
      } satisfies PnpmVcsCatalogBindingsData,
    };
  };
}

function addPnpmVcsConfig(
  workspace: Workspace,
  componentMap: ComponentMap,
  storedTrackerConfig: Record<string, any> | undefined,
  pnpmVcs: PnpmVcsComponentConfig
): void {
  const localTrackerConfig = componentMap.config?.[TrackerAspect.id];
  workspace.bitMap.addComponentConfig(componentMap.id, TrackerAspect.id, {
    ...storedTrackerConfig,
    ...(localTrackerConfig && localTrackerConfig !== '-' ? localTrackerConfig : undefined),
    pnpmVcs,
  });
}

function addPackageNameConfig(
  workspace: Workspace,
  componentMap: ComponentMap,
  storedConfig: Record<string, any> | undefined,
  packageName: string
): void {
  const localConfig = componentMap.config?.[DependencyResolverAspect.id];
  workspace.bitMap.addComponentConfig(componentMap.id, DependencyResolverAspect.id, {
    ...storedConfig,
    ...(localConfig && localConfig !== '-' ? localConfig : undefined),
    packageName,
  });
}

export function requirementsForProfile(profile: WorkspaceToolMap): WorkspaceToolMap {
  return Object.fromEntries(Object.entries(profile).map(([slot, selection]) => [slot, { ...selection }]));
}

export function validateWorkspaceProfile(profile: WorkspaceToolMap): void {
  for (const [slot, selection] of Object.entries(profile)) {
    if (!slot || !selection.implementation || !semver.valid(selection.version)) {
      throw new BitError(`invalid pnpm VCS workspace profile selection for ${slot || '<empty>'}`);
    }
  }
}

export function validateWorkspaceRequirements(
  profile: WorkspaceToolMap,
  requirements: WorkspaceToolMap,
  component: string
): void {
  for (const [slot, requirement] of Object.entries(requirements)) {
    const selection = profile[slot];
    if (!selection) {
      throw new BitError(
        `pnpm VCS component ${component} requires ${slot} (${requirement.implementation} ${requirement.version}), but the workspace profile does not select ${slot}`
      );
    }
    if (selection.implementation !== requirement.implementation) {
      throw new BitError(
        `pnpm VCS component ${component} requires ${slot} implementation ${requirement.implementation}, but the workspace selects ${selection.implementation}`
      );
    }
    if (!semver.validRange(requirement.version) || !semver.satisfies(selection.version, requirement.version)) {
      throw new BitError(
        `pnpm VCS component ${component} requires ${slot} ${requirement.implementation}@${requirement.version}, but the workspace selects ${selection.implementation}@${selection.version}`
      );
    }
  }
}

/**
 * Enforce the profile before import writes, then persist the effective profile
 * once the writer has attached a component map. Components created before the
 * pnpm VCS protocol remain importable and the next inventory sync binds them
 * to the exact profile.
 */
export async function applyWorkspaceProfileToImportedComponents(
  workspace: Workspace,
  components: ConsumerComponent[]
): Promise<boolean> {
  const rootMap = workspace.consumer.bitMap.components.find(
    (component) => !component.rootDir && component.useExplicitFiles
  );
  if (!rootMap) return false;
  const rootTrackerConfig = rootMap.config?.[TrackerAspect.id];
  const rootPnpmVcs =
    rootTrackerConfig && rootTrackerConfig !== '-' ? readPnpmVcsConfig(rootTrackerConfig.pnpmVcs) : undefined;
  if (!rootPnpmVcs) return false;

  const declared = components.flatMap((component) => {
    const trackerEntry = component.extensions.findCoreExtension(TrackerAspect.id);
    const pnpmVcs = readPnpmVcsConfig(trackerEntry?.config?.pnpmVcs);
    if (!trackerEntry || !pnpmVcs) return [];
    validateWorkspaceRequirements(
      rootPnpmVcs.appliedProfile,
      pnpmVcs.requirements,
      component.id.toStringWithoutVersion()
    );
    return [{ component, trackerEntry, pnpmVcs }];
  });

  let persisted = false;
  declared.forEach(({ component, trackerEntry, pnpmVcs }) => {
    let effectiveTrackerEntry = trackerEntry;
    let effectivePnpmVcs = pnpmVcs;
    if (!isEqual(pnpmVcs.appliedProfile, rootPnpmVcs.appliedProfile)) {
      component.extensions = component.extensions.clone();
      const clonedTrackerEntry = component.extensions.findCoreExtension(TrackerAspect.id);
      if (!clonedTrackerEntry) throw new Error(`unable to update pnpm VCS profile for ${component.id.toString()}`);
      effectivePnpmVcs = { ...pnpmVcs, appliedProfile: rootPnpmVcs.appliedProfile };
      clonedTrackerEntry.config = {
        ...trackerEntry.config,
        pnpmVcs: effectivePnpmVcs,
      };
      effectiveTrackerEntry = clonedTrackerEntry;
    }
    if (component.componentMap) {
      addPnpmVcsConfig(workspace, component.componentMap, effectiveTrackerEntry.config, effectivePnpmVcs);
      persisted = true;
    }
  });
  return persisted;
}

/**
 * Describe the pnpm workspace edits needed after Bit has written imported
 * components. The component model is authoritative for the exact dependency
 * version; pnpm decides whether a package is local and may replace it with a
 * workspace binding.
 */
export async function createPnpmVcsImportPlan(
  workspace: Workspace,
  dependencyResolver: DependencyResolverMain,
  components: ConsumerComponent[]
): Promise<PnpmVcsImportPlan | undefined> {
  const rootMap = workspace.consumer.bitMap.components.find(
    (component) => !component.rootDir && component.useExplicitFiles
  );
  if (!rootMap) return undefined;
  const rootTrackerConfig = rootMap.config?.[TrackerAspect.id];
  if (!rootTrackerConfig || rootTrackerConfig === '-' || !readPnpmVcsConfig(rootTrackerConfig.pnpmVcs)) {
    return undefined;
  }

  const plannedComponents: PnpmVcsImportPlan['components'] = [];
  const catalogBindings = new Map<string, PnpmVcsImportPlan['catalogs'][number]>();
  for (const component of components) {
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

  for (const component of components) {
    const packageJsonFile = component.files.find((file) => file.relative === 'package.json');
    if (!packageJsonFile) continue;
    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(packageJsonFile.contents.toString());
    } catch (error: any) {
      throw new BitError(`unable to read package.json of imported component ${component.id}: ${error.message}`);
    }
    const dependencies = dependencyResolver.getDependenciesFromLegacyComponent(component, { includeHidden: true });
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      const entries = manifest[field];
      if (!entries || typeof entries !== 'object' || Array.isArray(entries)) continue;
      for (const [dependencyName, rawSpecifier] of Object.entries(entries)) {
        if (typeof rawSpecifier !== 'string' || !rawSpecifier.startsWith('catalog:')) continue;
        const catalogName = rawSpecifier.slice('catalog:'.length) || 'default';
        const dependency = dependencies.findByPkgNameOrCompId(dependencyName);
        if (!dependency) {
          throw new BitError(
            `component ${component.id} references ${dependencyName} through ${rawSpecifier}, but its component model has no matching dependency`
          );
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

function packageNameFromLegacyComponent(component: ConsumerComponent): string {
  const packageJsonFile = component.files.find((file) => file.relative === 'package.json');
  if (!packageJsonFile) {
    throw new BitError(`pnpm VCS component ${component.id} does not contain package.json`);
  }
  let name: unknown;
  try {
    name = JSON.parse(packageJsonFile.contents.toString())?.name;
  } catch (error: any) {
    throw new BitError(`unable to read package.json of imported component ${component.id}: ${error.message}`);
  }
  if (typeof name !== 'string' || !name) {
    throw new BitError(`pnpm VCS component ${component.id} must declare a package name`);
  }
  return name;
}

function addOrUpdateComponent(
  bitMap: BitMap,
  existing: ComponentMap | undefined,
  componentName: string,
  defaultScope: string,
  mainFile: string,
  files: string[],
  rootDir?: string
): ComponentMap {
  const componentId = existing?.id || ComponentID.fromObject({ name: componentName }, defaultScope);
  const componentFiles: ComponentMapFile[] = files.map((relativePath) => ({
    relativePath,
    name: path.basename(relativePath),
    test: false,
  }));
  const componentMap = bitMap.addComponent({
    componentId,
    files: componentFiles,
    defaultScope: componentId.hasScope() ? undefined : existing?.defaultScope || defaultScope,
    mainFile,
    config: existing?.config,
  });
  if (rootDir) {
    // pnpm projects may be nested. Set the root after creation so the generic tracker parent-root
    // guard does not reject a valid deepest-owner inventory.
    componentMap.rootDir = rootDir;
    bitMap.addFilesToComponent({ componentId: componentMap.id, files: componentFiles });
  }
  componentMap.useExplicitFiles = true;
  if (componentMap.config?.[Extensions.remove]) {
    componentMap.config[Extensions.remove] = { removed: false };
  }
  return componentMap;
}

function validateRelativePath(value: string, label: string): string {
  const normalized = pathNormalizeToLinux(path.normalize(value));
  if (!normalized || normalized === '.' || path.isAbsolute(value) || normalized.startsWith('../')) {
    throw new BitError(`invalid ${label}: ${value}`);
  }
  return normalized.replace(/\/$/, '');
}

function pathDepth(value: string): number {
  return value.split('/').length;
}

export function assignFilesToProjects(
  allFiles: string[],
  projects: PnpmProjectInventoryItem[]
): { rootsByDepth: PnpmProjectInventoryItem[]; filesByRoot: Map<string, string[]>; rootFiles: string[] } {
  const rootsByDepth = [...projects].sort((a, b) => pathDepth(b.rootDir) - pathDepth(a.rootDir));
  const filesByRoot = new Map<string, string[]>();
  const rootFiles: string[] = [];
  for (const file of allFiles.map(pathNormalizeToLinux)) {
    const owner = rootsByDepth.find((project) => isPathInside(file, project.rootDir));
    if (!owner) {
      rootFiles.push(file);
      continue;
    }
    const relative = file.slice(owner.rootDir.length + 1);
    const ownedFiles = filesByRoot.get(owner.rootDir) || [];
    ownedFiles.push(relative);
    filesByRoot.set(owner.rootDir, ownedFiles);
  }
  return { rootsByDepth, filesByRoot, rootFiles };
}

function isPathInside(file: string, rootDir: string): boolean {
  return file.startsWith(`${rootDir}/`);
}

function assertUnique(values: string[], label: string): void {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  if (duplicates.length) throw new BitError(`duplicate pnpm ${label}: ${duplicates[0]}`);
}
