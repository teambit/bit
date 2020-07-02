import chalk from 'chalk';
import _ from 'lodash';
import { Command, CommandOptions } from '../cli';
import { IsolatorExtension } from './isolator.extension';
import { loadConsumer } from '../../consumer';
import CapsuleList from './capsule-list';

type CreateOpts = {
  baseDir?: string;
  alwaysNew: boolean;
  id: string;
  installPackages: boolean;
};

export class CapsuleCreateCmd implements Command {
  name = 'capsule-create [componentIds...]';
  description = `create capsule`;
  shortDescription = 'create capsule';
  group = 'capsules';
  private = true;
  alias = '';
  options = [
    ['b', 'baseDir <name>', 'set base dir of all capsules'],
    ['a', 'alwaysNew', 'create new environment for capsule'],
    ['i', 'id <name>', 'reuse capsule of certain name'],
    ['j', 'json', 'json format'],
    ['d', 'installPackages', 'install packages in capsule with npm']
  ] as CommandOptions;

  constructor(private isolator: IsolatorExtension) {}

  async create(
    [componentIds]: [string[]],
    { baseDir, alwaysNew = false, id, installPackages = false }: CreateOpts
  ): Promise<CapsuleList> {
    // @todo: why it is not an array?
    if (componentIds && !Array.isArray(componentIds)) componentIds = [componentIds];
    // TODO: remove this consumer loading from here. it shouldn't be here
    const consumer = await loadConsumer();
    const capsuleOptions = _.omitBy({ baseDir, installPackages, alwaysNew, name: id }, _.isNil);
    const isolatedEnvironment = await this.isolator.createNetworkFromConsumer(componentIds, consumer, capsuleOptions);
    const capsules = isolatedEnvironment.capsules;
    return capsules;
  }

  async report([componentIds]: [string[]], opts: CreateOpts) {
    // @ts-ignore
    const capsules = await this.create(componentIds, opts);
    const capsuleOutput = capsules
      .map(capsule => `${chalk.bold(capsule.id.toString())} - ${capsule.capsule.path}`)
      .join('\n');
    const title = `${capsules.length} capsule(s) were created successfully`;
    return `${chalk.green(title)}\n${capsuleOutput}`;
  }

  async json([componentIds]: [string[]], opts: CreateOpts) {
    // @ts-ignore
    const capsules = await this.create(componentIds, opts);
    return capsules.map(c => ({
      id: c.id.toString(),
      path: c.capsule.path
    }));
  }
}
