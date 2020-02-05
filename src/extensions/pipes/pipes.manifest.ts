import { Pipes } from './pipes';
import { BitCliExt } from '../cli';
import { WorkspaceExt } from '../workspace';
import { CapsuleExt } from '../capsule';

export default {
  name: 'pipes',
  dependencies: [BitCliExt, WorkspaceExt, CapsuleExt],
  provider: Pipes.provide
};
