// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from 'react';
import _ from 'lodash';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Color } from 'ink';
import { Command, CommandOptions } from '../cli';
import { IsolatorExtension } from './isolator.extension';
import { loadConsumerIfExist } from '../../consumer';
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
    const consumer = await loadConsumerIfExist();
    // TODO: throw a proper error instance
    if (!consumer) throw new Error('no consumer found');
    const capsuleOptions = _.omitBy({ baseDir, installPackages, alwaysNew, name: id }, _.isNil);
    const isolatedEnvironment = await this.isolator.createNetworkFromConsumer(componentIds, consumer, capsuleOptions);
    const capsules = isolatedEnvironment.capsules;
    return capsules;
  }

  async render([componentIds]: [string[]], opts: CreateOpts) {
    // @ts-ignore
    const capsules = await this.create(componentIds, opts);
    // TODO: improve output
    return <Color green>created capsules {capsules}</Color>;
  }

  async json([componentIds]: [string[]], opts: CreateOpts) {
    // @ts-ignore
    const capsules = await this.create(componentIds, opts);
    return capsules;
  }
}
