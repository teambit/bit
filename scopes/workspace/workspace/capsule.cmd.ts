// eslint-disable-next-line max-classes-per-file
import type { Command, CommandOptions } from '@teambit/cli';
import { formatItem, formatTitle, formatSuccessSummary, formatHint } from '@teambit/cli';
import type { CapsuleList, IsolateComponentsOptions, IsolatorMain, PruneCapsulesReport } from '@teambit/isolator';
import type { ScopeMain } from '@teambit/scope';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import type { Workspace } from './workspace';

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

type CreateOpts = {
  baseDir?: string;
  rootBaseDir?: string;
  alwaysNew?: boolean;
  seedersOnly?: boolean;
  useHash?: boolean;
  id: string;
  installPackages?: boolean;
};

export class CapsuleCreateCmd implements Command {
  name = 'create [component-id...]';
  description = `create capsules for components`;
  helpUrl = 'reference/build-pipeline/capsule';
  group = 'advanced';
  alias = '';
  options = [
    [
      'b',
      'base-dir <name>',
      'set base dir of all capsules (hashed to create the base dir inside the root dir - host path by default)',
    ],
    ['r', 'root-base-dir <name>', 'set root base dir of all capsules (absolute path to use as root dir)'],
    ['a', 'always-new', 'create new environment for capsule'],
    ['s', 'seeders-only', 'create capsules for the seeders only (not for the entire graph)'],
    ['i', 'id <name>', 'reuse capsule of certain name'],
    ['', 'use-hash', 'whether to use hash function (of base dir) as capsules root dir name'],
    ['j', 'json', 'json format'],
    ['d', 'install-packages', 'install packages by the package-manager'],
    ['p', 'package-manager <name>', 'npm, yarn or pnpm, default to npm'],
  ] as CommandOptions;

  constructor(
    private workspace: Workspace | undefined,
    private scope: ScopeMain,
    private isolator: IsolatorMain
  ) {}

  async create(
    [componentIds = []]: [string[]],
    { baseDir, rootBaseDir, alwaysNew = false, id, installPackages = false, seedersOnly = false, useHash }: CreateOpts
  ): Promise<CapsuleList> {
    // @todo: why it is not an array?
    if (componentIds && !Array.isArray(componentIds)) componentIds = [componentIds];
    let finalUseHash = useHash;
    if (useHash === undefined) {
      if (baseDir) {
        finalUseHash = false;
      } else {
        finalUseHash = this.workspace
          ? this.workspace?.shouldUseHashForCapsules()
          : this.scope.shouldUseHashForCapsules();
      }
    }

    const baseInstallOptions = { installPackages };
    const additionalInstallOptions = this.workspace
      ? {}
      : {
          copyPeerToRuntimeOnRoot: true,
          useNesting: true,
          copyPeerToRuntimeOnComponents: true,
          installPeersFromEnvs: true,
        };
    const installOptions = { ...baseInstallOptions, ...additionalInstallOptions };

    const capsuleOptions: IsolateComponentsOptions = {
      baseDir,
      rootBaseDir,
      installOptions,
      alwaysNew,
      seedersOnly,
      includeFromNestedHosts: true,
      name: id,
      useHash: finalUseHash,
    };
    const host = this.workspace || this.scope;
    const ids = await host.resolveMultipleComponentIds(componentIds);
    const network = await this.isolator.isolateComponents(ids, capsuleOptions);
    const capsules = network.graphCapsules;
    return capsules;
  }

  async report([componentIds]: [string[]], opts: CreateOpts) {
    // @ts-ignore
    const capsules = await this.create(componentIds, opts);
    const items = capsules.map((capsule) =>
      formatItem(`${chalk.bold(capsule.component.id.toString())} - ${capsule.path}`)
    );
    return `${formatSuccessSummary(`${capsules.length} capsule(s) were created`)}\n${items.join('\n')}`;
  }

  async json([componentIds]: [string[]], opts: CreateOpts) {
    // @ts-ignore
    const capsules = await this.create(componentIds, opts);
    return capsules.map((c) => ({
      id: c.component.id.toString(),
      path: c.path,
    }));
  }
}

export class CapsuleListCmd implements Command {
  name = 'list';
  description = `list the capsules generated for this workspace`;
  group = 'advanced';
  alias = '';
  options = [['j', 'json', 'json format']] as CommandOptions;

  constructor(
    private isolator: IsolatorMain,
    private workspace: Workspace | undefined,
    private scope: ScopeMain
  ) {}

  async report() {
    if (!this.workspace && !this.scope) {
      throw new Error(`This command requires a Bit workspace or scope.
To initialize a workspace: bit init`);
    }

    const { workspaceCapsulesRootDir, scopeAspectsCapsulesRootDir, scopeCapsulesRootDir } = this.getCapsulesRootDirs();
    const listWs = workspaceCapsulesRootDir ? await this.isolator.list(workspaceCapsulesRootDir) : undefined;
    const listScope = await this.isolator.list(scopeAspectsCapsulesRootDir);

    const hostPath = this.workspace ? this.workspace.path : this.scope.path;
    const numOfWsCapsules = listWs ? listWs.capsules.length : listScope.capsules.length;
    const hostType = this.workspace ? 'workspace' : 'scope';

    const allRoots = await this.isolator.listAllCapsuleRoots();
    const totalSize = allRoots.reduce((sum, r) => sum + r.sizeBytes, 0);
    const orphanChecks = await Promise.all(
      allRoots
        .filter((r) => r.originPath)
        .map(async (r): Promise<number> => ((await fs.pathExists(r.originPath as string)) ? 0 : 1))
    );
    const orphanCount = orphanChecks.reduce((a: number, b: number) => a + b, 0);
    const staleAspectsAgeMs = 30 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - staleAspectsAgeMs;
    const staleChecks = await Promise.all(
      allRoots
        .filter((r) => r.kind === 'scope-aspects-root')
        .map((r): Promise<number> => this.countStaleAspectChildren(r.path, cutoff))
    );
    const staleAspectCount = staleChecks.reduce((a: number, b: number) => a + b, 0);

    const title = formatTitle(`found ${numOfWsCapsules} capsule(s) for ${hostType}: ${hostPath}`);
    const wsLine = listWs ? formatItem(`workspace capsules root-dir: ${workspaceCapsulesRootDir}`) : undefined;
    const scopeAspectLine = formatItem(`scope's aspects capsules root-dir: ${scopeAspectsCapsulesRootDir}`);
    const scopeLine = scopeCapsulesRootDir
      ? formatItem(`scope's capsules root-dir: ${scopeCapsulesRootDir}`)
      : undefined;
    const summaryLine = formatItem(
      `cache total: ${chalk.bold(formatBytes(totalSize))} across ${allRoots.length} subdir(s) — ` +
        `${orphanCount} orphan(s), ${staleAspectCount} stale aspect-version(s) (>${30}d)`
    );
    const suggestLine = formatHint(`use --json to get the list of all capsules`);
    const lines = [title, wsLine, scopeAspectLine, scopeLine, summaryLine, suggestLine].filter((x) => x).join('\n');

    return lines;
  }

  private async countStaleAspectChildren(rootPath: string, cutoffMs: number): Promise<number> {
    try {
      const entries = await fs.readdir(rootPath, { withFileTypes: true });
      let count = 0;
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const childPath = path.join(rootPath, entry.name);
        const markerPath = path.join(childPath, '.bit-capsule-origin.json');
        try {
          const stat = await fs.stat(markerPath);
          if (stat.mtime.getTime() < cutoffMs) count += 1;
        } catch {
          const stat = await fs.stat(childPath).catch(() => undefined);
          if (stat && stat.mtime.getTime() < cutoffMs) count += 1;
        }
      }
      return count;
    } catch {
      return 0;
    }
  }

  async json() {
    if (!this.workspace && !this.scope) {
      throw new Error(`This command requires a Bit workspace or scope.
To initialize a workspace: bit init`);
    }

    const rootDirs = this.getCapsulesRootDirs();
    const listWs = rootDirs.workspaceCapsulesRootDir
      ? await this.isolator.list(rootDirs.workspaceCapsulesRootDir)
      : undefined;
    const listScope = await this.isolator.list(rootDirs.scopeAspectsCapsulesRootDir);
    const capsules = listWs ? listWs.capsules : [];
    const scopeCapsules = listScope ? listScope.capsules : [];
    const allRoots = await this.isolator.listAllCapsuleRoots();
    const totalSizeBytes = allRoots.reduce((sum, r) => sum + r.sizeBytes, 0);
    return { ...rootDirs, capsules, scopeCapsules, totalSizeBytes, allRoots };
  }

  private getCapsulesRootDirs() {
    return getCapsulesRootDirs(this.isolator, this.scope, this.workspace);
  }
}

export class CapsuleDeleteCmd implements Command {
  name = 'delete';
  description = `delete capsules`;
  extendedDescription = `with no args, only workspace's capsules are deleted`;
  group = 'advanced';
  alias = '';
  options = [
    ['', 'scope-aspects', 'delete scope-aspects capsules'],
    ['a', 'all', 'delete all capsules for all workspaces and scopes'],
  ] as CommandOptions;

  constructor(
    private isolator: IsolatorMain,
    private scope: ScopeMain,
    private workspace?: Workspace
  ) {}

  async report(args: [], { all, scopeAspects }: { all: boolean; scopeAspects: boolean }) {
    const capsuleBaseDirToDelete = (): string | undefined => {
      if (all) return undefined;
      if (scopeAspects) {
        const { scopeAspectsCapsulesRootDir } = getCapsulesRootDirs(this.isolator, this.scope, this.workspace);
        return scopeAspectsCapsulesRootDir;
      }
      return undefined;
    };
    const capsuleBaseDir = capsuleBaseDirToDelete();
    const deletedDir = await this.isolator.deleteCapsules(capsuleBaseDir);
    return formatSuccessSummary(`capsules dir has been deleted: ${chalk.bold(deletedDir)}`);
  }
}

type PruneOpts = {
  olderThan?: number;
  keepWorkspaceCaps?: boolean;
  orphans?: boolean;
  sizeTarget?: number;
  dryRun?: boolean;
  json?: boolean;
};

export class CapsulePruneCmd implements Command {
  name = 'prune';
  description = 'evict stale capsules from the global cache';
  extendedDescription = `workspace capsules are deleted unconditionally; aspect-version and scope capsules are deleted when their last-used marker is older than --older-than (default 30 days).
use --dry-run first to preview what would be removed.`;
  group = 'advanced';
  alias = '';
  options = [
    ['', 'older-than <days>', 'age threshold in days for aspect-version/scope capsule pruning (default 30)'],
    ['', 'keep-workspace-caps', 'skip workspace capsule deletion'],
    ['', 'no-orphans', "don't delete capsules whose origin path no longer exists"],
    ['', 'size-target <gb>', 'after standard pruning, LRU-evict aspect-versions until total drops below this size'],
    ['', 'dry-run', 'preview what would be removed without deleting'],
    ['j', 'json', 'json format'],
  ] as CommandOptions;

  constructor(private isolator: IsolatorMain) {}

  async report(_args: [], opts: PruneOpts) {
    const report = await this.runPrune(opts);
    const header = report.dryRun
      ? formatTitle(`[dry-run] would remove ${report.removed.length} capsule(s)`)
      : formatSuccessSummary(`removed ${report.removed.length} capsule(s)`);
    const sizeLine = formatItem(
      `cache: ${formatBytes(report.totalSizeBeforeBytes)} → ${formatBytes(report.totalSizeAfterBytes)} ` +
        `(freed ${formatBytes(report.totalRemovedBytes)})`
    );
    const items = report.removed
      .slice(0, 50)
      .map((r) =>
        formatItem(`${chalk.dim(`[${r.kind} · ${r.reason}]`)} ${r.path} ${chalk.dim(`(${formatBytes(r.sizeBytes)})`)}`)
      );
    const truncated =
      report.removed.length > 50
        ? formatHint(`...and ${report.removed.length - 50} more (use --json to see the full list)`)
        : undefined;
    return [header, sizeLine, ...items, truncated].filter(Boolean).join('\n');
  }

  async json(_args: [], opts: PruneOpts) {
    return this.runPrune(opts);
  }

  private async runPrune(opts: PruneOpts): Promise<PruneCapsulesReport> {
    return this.isolator.pruneCapsules({
      olderThanDays: opts.olderThan !== undefined ? Number(opts.olderThan) : undefined,
      keepWorkspaceCaps: opts.keepWorkspaceCaps === true,
      // commander turns `--no-orphans` into `orphans: false`; default `true`.
      includeOrphans: opts.orphans !== false,
      sizeTargetGb: opts.sizeTarget !== undefined ? Number(opts.sizeTarget) : undefined,
      dryRun: opts.dryRun === true,
    });
  }
}

export class CapsuleCmd implements Command {
  name = 'capsule';
  description = 'manage isolated component environments';
  extendedDescription = `capsules are temporary isolated directories containing component code and dependencies.
automatically created during build processes to compile and test components in isolation.
ensures components work independently before publishing, similar to how they'll be consumed.`;
  alias = '';
  group = 'advanced';
  commands: Command[] = [];
  options = [['j', 'json', 'json format']] as CommandOptions;

  constructor(
    private isolator: IsolatorMain,
    private workspace: Workspace | undefined,
    private scope: ScopeMain
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async report(args: [string]) {
    return new CapsuleListCmd(this.isolator, this.workspace, this.scope).report();
  }
}

function getCapsulesRootDirs(isolator, scope: ScopeMain, workspace) {
  const workspaceCapsulesRootDir = workspace
    ? isolator.getCapsulesRootDir({
        baseDir: workspace.getCapsulePath(),
        useHash: workspace.shouldUseHashForCapsules(),
      })
    : undefined;
  const scopeAspectsCapsulesRootDir = isolator.getCapsulesRootDir({
    baseDir: scope.getAspectCapsulePath(),
    useHash: scope.shouldUseHashForCapsules(),
  });
  const scopeCapsulesRootDir = workspace
    ? undefined
    : isolator.getCapsulesRootDir({
        baseDir: process.cwd(),
        useHash: true,
      });

  return { workspaceCapsulesRootDir, scopeAspectsCapsulesRootDir, scopeCapsulesRootDir };
}
