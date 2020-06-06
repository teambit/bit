import { Packer } from './pack';
import { BitCli } from '../cli';
import { PackCmd } from './pack.cmd';
import { ScopeExtension } from '../scope';

export type PackDeps = [BitCli, ScopeExtension];

export default async function packProvider([cli, scope]: PackDeps) {
  const packer = new Packer(scope?.legacyScope);
  // @ts-ignore
  cli.register(new PackCmd(packer));
  return packer;
}
