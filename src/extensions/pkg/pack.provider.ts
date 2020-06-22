import { Packer } from './pack';
import { PackCmd } from './pack.cmd';
import { ScopeExtension } from '../scope';
import { CLIExtension } from '../cli';

export type PackDeps = [CLIExtension, ScopeExtension];

export default async function packProvider([cli, scope]: PackDeps) {
  const packer = new Packer(scope?.legacyScope);
  cli.register(new PackCmd(packer));
  return packer;
}
