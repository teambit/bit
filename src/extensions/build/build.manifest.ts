import { Build } from './build';
import { BitCliExt } from '../cli';
import { WorkspaceExt } from '../workspace';
import { CapsuleExt } from '../capsule';

export default {
  name: 'Build',
  dependencies: [BitCliExt, WorkspaceExt, CapsuleExt],
  provider: Build.provide
};
