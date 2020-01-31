import { WorkspaceExt } from '../workspace';
import { ScopeExt } from '../scope';
import { CapsuleExt } from '../../capsule';
import provideBit from './bit.provider';
import { BuildExt } from '../build';
import { ComposerExt } from '../composer';

export default {
  name: 'Bit',
  dependencies: [WorkspaceExt, ScopeExt, CapsuleExt, BuildExt, ComposerExt],
  config: {},
  provider: provideBit
};
