import { Pipes } from './pipes';
import { BitCliExt } from '../cli';
import { WorkspaceExt } from '../workspace';
import { CapsuleExt } from '../capsule';

export default {
  name: 'Pipes',
  dependencies: [BitCliExt, WorkspaceExt, CapsuleExt],
  provider: Pipes.provide
};
