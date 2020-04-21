import { Packer } from './pack';
import { BitCli } from '@bit/bit.core.cli';
import { PackCmd } from './pack.cmd';
import { Scope } from '@bit/bit.core.scope';

export type PackDeps = [BitCli, Scope];

export default async function packProvider([cli, scope]: PackDeps) {
  const packer = new Packer(scope?.legacyScope);
  // @ts-ignore
  cli.register(new PackCmd(packer));
  return packer;
}
