// eslint-disable-next-line max-classes-per-file
import { Command, CommandOptions } from '@teambit/cli';
import { CapsuleList, IsolateComponentsOptions, IsolatorMain } from '@teambit/isolator';
import chalk from 'chalk';

import { Workspace } from '.';

type CreateOpts = {
  baseDir?: string;
  alwaysNew?: boolean;
  seedersOnly?: boolean;
  id: string;
  installPackages?: boolean;
};

export class CapsuleCreateCmd implements Command {
  name = 'create [componentIds...]';
  description = `create capsules`;
  group = 'capsules';
  alias = '';
  options = [
    ['b', 'base-dir <name>', 'set base dir of all capsules'],
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
    { baseDir, alwaysNew = false, id, installPackages = false, seedersOnly = false }: CreateOpts
  ): Promise<CapsuleList> {
    // @todo: why it is not an array?
    if (componentIds && !Array.isArray(componentIds)) componentIds = [componentIds];
    const capsuleOptions: IsolateComponentsOptions = {
      baseDir,
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
  description = `list all capsules`;
  shortDescription = 'list all capsules';
  group = 'capsules';
  alias = '';
  options = [['j', 'json', 'json format']] as CommandOptions;

  constructor(private isolator: IsolatorMain, private workspace: Workspace) {}

  async report() {
    const list = await this.isolator.list(this.workspace.path);
    const { workspaceCapsulesRootDir, scopeCapsulesRootDir, scopeAspectsCapsulesRootDir } = this.getCapsulesRootDirs();
    // TODO: improve output
    return chalk.green(`found ${chalk.cyan(list.capsules.length.toString())} capsule(s) for workspace:  ${chalk.cyan(
      list.workspace
    )}
workspace capsules root-dir:       ${chalk.cyan(workspaceCapsulesRootDir)}
scope capsules root-dir:           ${chalk.cyan(scopeCapsulesRootDir)}
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
    const scopeCapsulesRootDir = this.isolator.getCapsulesRootDir(this.workspace.scope.path);
    const scopeAspectsCapsulesRootDir = this.isolator.getCapsulesRootDir(this.workspace.scope.getAspectCapsulePath());

    return { workspaceCapsulesRootDir, scopeCapsulesRootDir, scopeAspectsCapsulesRootDir };
  }
}

export class CapsuleCmd implements Command {
  name = 'capsule <sub-command>';
  description = 'manage capsules';
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
