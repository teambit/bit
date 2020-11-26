import { Command, CommandOptions } from '@teambit/cli';
import { CapsuleList, IsolateComponentsOptions } from '@teambit/isolator';
import chalk from 'chalk';

import { Workspace } from '.';

type CreateOpts = {
  baseDir?: string;
  alwaysNew?: boolean;
  id: string;
  installPackages?: boolean;
};

export class CapsuleCreateCmd implements Command {
  name = 'capsule-create [componentIds...]';
  description = `create capsule`;
  shortDescription = 'create capsule';
  group = 'capsules';
  private = true;
  alias = '';
  options = [
    ['b', 'base-dir <name>', 'set base dir of all capsules'],
    ['a', 'always-new', 'create new environment for capsule'],
    ['i', 'id <name>', 'reuse capsule of certain name'],
    ['j', 'json', 'json format'],
    ['d', 'install-packages', 'install packages by the package-manager'],
    ['p', 'package-manager <name>', 'npm, yarn or pnpm, default to npm'],
  ] as CommandOptions;

  constructor(private workspace: Workspace) {}

  async create(
    [componentIds]: [string[]],
    { baseDir, alwaysNew = false, id, installPackages = false }: CreateOpts
  ): Promise<CapsuleList> {
    // @todo: why it is not an array?
    if (componentIds && !Array.isArray(componentIds)) componentIds = [componentIds];
    const capsuleOptions: IsolateComponentsOptions = {
      baseDir,
      installOptions: { installPackages },
      alwaysNew,
      name: id,
    };
    const isolatedEnvironment = await this.workspace.createNetwork(componentIds, capsuleOptions);
    const capsules = isolatedEnvironment.graphCapsules;
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
