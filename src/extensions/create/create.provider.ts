import { Workspace } from '../workspace';
import { BitCli } from '../cli';
import { CreateCmd } from './create.cmd';
import { Create, Registry } from './create';
import { Harmony } from '../../harmony';

export type CreateConfig = {};

export type CreateDeps = [BitCli, Workspace];

export async function provideCreate(
  config: CreateConfig,
  [cli, workspace]: CreateDeps,
  harmony: Harmony<unknown>
): Promise<Create> {
  const create = new Create(workspace, new Registry(harmony));
  // @ts-ignore
  cli.register(new CreateCmd(create));
  return create;
}
