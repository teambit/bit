// eslint-disable-next-line max-classes-per-file
import type { Command, CommandOptions } from '@teambit/cli';
import type { CapsuleList, IsolateComponentsOptions, IsolatorMain } from '@teambit/isolator';
import type { ScopeMain } from '@teambit/scope';
import chalk from 'chalk';
import type { Workspace } from './workspace';

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
    const capsuleOutput = capsules
      .map((capsule) => `${chalk.bold(capsule.component.id.toString())} - ${capsule.path}`)
      .join('\n');
    const title = `${capsules.length} capsule(s) were created successfully`;
    return `${chalk.green(title)}\n${capsuleOutput}`;
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
    const { workspaceCapsulesRootDir, scopeAspectsCapsulesRootDir, scopeCapsulesRootDir } = this.getCapsulesRootDirs();
    const listWs = workspaceCapsulesRootDir ? await this.isolator.list(workspaceCapsulesRootDir) : undefined;
    const listScope = await this.isolator.list(scopeAspectsCapsulesRootDir);

    const hostPath = this.workspace ? this.workspace.path : this.scope.path;
    const numOfWsCapsules = listWs ? listWs.capsules.length : listScope.capsules.length;
    const hostType = this.workspace ? 'workspace' : 'scope';

    const title = chalk.green(
      `found ${chalk.cyan(numOfWsCapsules.toString())} capsule(s) for ${hostType}:  ${chalk.cyan(hostPath)}`
    );
    const wsLine = listWs
      ? chalk.green(`workspace capsules root-dir:       ${chalk.cyan(workspaceCapsulesRootDir)}`)
      : undefined;
    const scopeAspectLine = chalk.green(
      `scope's aspects capsules root-dir: ${chalk.cyan(scopeAspectsCapsulesRootDir)}`
    );
    const scopeLine = chalk.green(`scope's capsules root-dir: ${chalk.cyan(scopeCapsulesRootDir)}`);
    const suggestLine = chalk.green(`use --json to get the list of all capsules`);
    const lines = [title, wsLine, scopeAspectLine, scopeLine, suggestLine].filter((x) => x).join('\n');

    // TODO: improve output
    return lines;
  }

  async json() {
    const rootDirs = this.getCapsulesRootDirs();
    const listWs = rootDirs.workspaceCapsulesRootDir
      ? await this.isolator.list(rootDirs.workspaceCapsulesRootDir)
      : undefined;
    const listScope = await this.isolator.list(rootDirs.scopeAspectsCapsulesRootDir);
    const capsules = listWs ? listWs.capsules : [];
    const scopeCapsules = listScope ? listScope.capsules : [];
    return { ...rootDirs, capsules, scopeCapsules };
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
    return chalk.green(`the following capsules dir has been deleted ${chalk.bold(deletedDir)}`);
  }
}

export class CapsuleCmd implements Command {
  name = 'capsule';
  description = 'manage capsules';
  extendedDescription = `a capsule is a directory containing the component code, isolated from the workspace.
normally, capsules are created during the build process, the component files are copied and the packages are installed
via the configured package-manager. the purpose is to compile/test them in isolation to make sure they will work for
other users after publishing/exporting them.`;
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
