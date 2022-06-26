// eslint-disable-next-line max-classes-per-file
import { Command, CommandOptions } from '@teambit/cli';
import { CapsuleList, IsolateComponentsOptions, IsolatorMain } from '@teambit/isolator';
import chalk from 'chalk';

import { Workspace } from '.';

type CreateOpts = {
  baseDir?: string;
  rootBaseDir?: string;
  alwaysNew?: boolean;
  seedersOnly?: boolean;
  id: string;
  installPackages?: boolean;
};

export class CapsuleCreateCmd implements Command {
  name = 'create [component-id...]';
  description = `create capsules for components`;
  group = 'capsules';
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
    ['j', 'json', 'json format'],
    ['d', 'install-packages', 'install packages by the package-manager'],
    ['p', 'package-manager <name>', 'npm, yarn or pnpm, default to npm'],
  ] as CommandOptions;

  constructor(private workspace: Workspace, private isolator: IsolatorMain) {}

  async create(
    [componentIds = []]: [string[]],
    { baseDir, rootBaseDir, alwaysNew = false, id, installPackages = false, seedersOnly = false }: CreateOpts
  ): Promise<CapsuleList> {
    // @todo: why it is not an array?
    if (componentIds && !Array.isArray(componentIds)) componentIds = [componentIds];
    const capsuleOptions: IsolateComponentsOptions = {
      baseDir,
      rootBaseDir,
      installOptions: { installPackages },
      alwaysNew,
      seedersOnly,
      includeFromNestedHosts: true,
      name: id,
    };
    const ids = await this.workspace.resolveMultipleComponentIds(componentIds);
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
  group = 'capsules';
  alias = '';
  options = [['j', 'json', 'json format']] as CommandOptions;

  constructor(private isolator: IsolatorMain, private workspace: Workspace) {}

  async report() {
    const list = await this.isolator.list(this.workspace.path);
    const { workspaceCapsulesRootDir, scopeAspectsCapsulesRootDir } = this.getCapsulesRootDirs();
    // TODO: improve output
    return chalk.green(`found ${chalk.cyan(list.capsules.length.toString())} capsule(s) for workspace:  ${chalk.cyan(
      list.workspace
    )}
workspace capsules root-dir:       ${chalk.cyan(workspaceCapsulesRootDir)}
scope's aspects capsules root-dir: ${chalk.cyan(scopeAspectsCapsulesRootDir)}
use --json to get the list of all workspace capsules`);
  }

  async json() {
    const list = await this.isolator.list(this.workspace.path);
    const rootDirs = this.getCapsulesRootDirs();
    return { ...list, ...rootDirs };
  }

  private getCapsulesRootDirs() {
    const workspaceCapsulesRootDir = this.isolator.getCapsulesRootDir(this.workspace.path);
    const scopeAspectsCapsulesRootDir = this.isolator.getCapsulesRootDir(this.workspace.scope.getAspectCapsulePath());

    return { workspaceCapsulesRootDir, scopeAspectsCapsulesRootDir };
  }
}

export class CapsuleDeleteCmd implements Command {
  name = 'delete';
  description = `delete capsules`;
  extendedDescription = `with no args, only workspace's capsules are deleted`;
  group = 'capsules';
  alias = '';
  options = [
    ['', 'scope-aspects', 'delete scope-aspects capsules'],
    ['a', 'all', 'delete all capsules for all workspaces and scopes'],
  ] as CommandOptions;

  constructor(private isolator: IsolatorMain, private workspace: Workspace) {}

  async report(args: [], { all, scopeAspects }: { all: boolean; scopeAspects: boolean }) {
    const capsuleBaseDirToDelete = (): string | null => {
      if (all) return null;
      if (scopeAspects) return this.workspace.scope.getAspectCapsulePath();
      return this.workspace.path;
    };
    const capsuleBaseDir = capsuleBaseDirToDelete();
    const deletedDir = await this.isolator.deleteCapsules(capsuleBaseDir);
    return chalk.green(`the following capsules dir has been deleted ${chalk.bold(deletedDir)}`);
  }
}

export class CapsuleCmd implements Command {
  name = 'capsule <sub-command>';
  description = 'manage capsules';
  extendedDescription = `a capsule is a directory containing the component code, isolated from the workspace.
normally, capsules are created during the build process, the component files are copied and the packages are installed
via the configured package-manager. the purpose is to compile/test them in isolation to make sure they will work for
other users after publishing/exporting them.`;
  alias = '';
  group = 'capsules';
  commands: Command[] = [];
  options = [] as CommandOptions;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async report(args: [string]) {
    // it should never be here. Yargs throws an error before reaching this method.
    return `Please specify a sub-command`;
  }
}
