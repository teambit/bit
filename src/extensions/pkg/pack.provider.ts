import { Packer } from './pack';
import { PackCmd } from './pack.cmd';
import { ScopeExtension } from '../scope';
import { PaperExtension } from '../paper';

export type PackDeps = [PaperExtension, ScopeExtension];

export default async function packProvider([cli, scope]: PackDeps) {
  const packer = new Packer(scope?.legacyScope);
  // @ts-ignore
  cli.register(new PackCmd(packer));
  return packer;
}
