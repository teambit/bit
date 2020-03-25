import { Packer } from './pack';
import { BitCli } from '../cli';
import { PackCmd } from './pack.cmd';
import { Scope } from '../scope';
import { Isolator } from '../isolator';

export type PackDeps = [BitCli, Scope, Isolator];

export default async function packProvider([cli, scope, isolator]: PackDeps) {
  const packer = new Packer(isolator, scope?.legacyScope);
  // @ts-ignore
  cli.register(new PackCmd(packer));
  return packer;
}
