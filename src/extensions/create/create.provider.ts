import { Harmony } from '@teambit/harmony';
import { Workspace } from '../workspace';
import { CreateCmd } from './create.cmd';
import { Create, Registry } from './create';
import { CreateExtConfig } from './types';
import { CLIExtension } from '../cli';
import { ConsumerNotFound } from '../../consumer/exceptions';

export type CreateConfig = {};

export type CreateDeps = [CLIExtension, Workspace];

export async function provideCreate(
  [cli, workspace]: CreateDeps,
  config: CreateExtConfig,
  _slots,
  harmony: Harmony
): Promise<Create> {
  if (!workspace) throw new ConsumerNotFound();
  const create = new Create(config, workspace, new Registry(harmony));
  cli.register(new CreateCmd(create));
  return create;
}
