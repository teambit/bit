import fs from 'fs-extra';
import ignore from 'ignore';
import path from 'path';
import { glob } from 'glob';
import type { Command, CommandOptions } from '@teambit/cli';
import { BitError } from '@teambit/bit-error';
import { ComponentID } from '@teambit/component-id';
import { retrieveIgnoreList } from '@teambit/git.modules.ignore-file-reader';
import type { BitMap, ComponentMap, ComponentMapFile } from '@teambit/legacy.bit-map';
import { Extensions } from '@teambit/legacy.constants';
import { pathNormalizeToLinux } from '@teambit/legacy.utils';
import type { Workspace } from '@teambit/workspace';

export type PnpmProjectInventoryItem = {
  rootDir: string;
  componentName: string;
  manifestFile: string;
};

export type PnpmWorkspaceInventory = {
  schemaVersion: 1;
  defaultScope: string;
  rootComponentName: string;
  rootMainFile: string;
  projects: PnpmProjectInventoryItem[];
};

export type PnpmVcsSyncResult = {
  schemaVersion: 1;
  rootComponent: string;
  components: Array<{ id: string; rootDir: string; files: number }>;
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
    throw new BitError('unsupported or invalid pnpm workspace inventory; expected schema version 1');
  }
  return parsed;
}

function isInventory(value: unknown): value is PnpmWorkspaceInventory {
  if (!value || typeof value !== 'object') return false;
  const inventory = value as Partial<PnpmWorkspaceInventory>;
  return (
    inventory.schemaVersion === 1 &&
    typeof inventory.defaultScope === 'string' &&
    typeof inventory.rootComponentName === 'string' &&
    Boolean(inventory.rootComponentName) &&
    typeof inventory.rootMainFile === 'string' &&
    Boolean(inventory.rootMainFile) &&
    Array.isArray(inventory.projects) &&
    inventory.projects.every(
      (project) =>
        project &&
        typeof project.rootDir === 'string' &&
        typeof project.componentName === 'string' &&
        typeof project.manifestFile === 'string'
    )
  );
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

  const bitMap = workspace.consumer.bitMap;
  const synced: PnpmVcsSyncResult['components'] = [];
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
    synced.push({ id: componentMap.id.toStringWithoutVersion(), rootDir: project.rootDir, files: files.length });
  }

  const rootMainFile = validateRelativePath(inventory.rootMainFile, 'root main file');
  if (!rootFiles.includes(rootMainFile)) {
    throw new BitError(`root component does not contain its main file ${rootMainFile} in the tracked file set`);
  }
  // The root package name may change over time. Its component identity, like a
  // project's identity, is anchored to its ownership location rather than the
  // latest package.json name.
  const existingRoot = bitMap.components.find((component) => !component.rootDir && component.useExplicitFiles);
  const rootComponent = addOrUpdateComponent(
    bitMap,
    existingRoot,
    inventory.rootComponentName,
    defaultScope,
    rootMainFile,
    rootFiles
  );
  synced.push({ id: rootComponent.id.toStringWithoutVersion(), rootDir: '.', files: rootFiles.length });

  return {
    schemaVersion: 1,
    rootComponent: rootComponent.id.toStringWithoutVersion(),
    components: synced,
  };
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
