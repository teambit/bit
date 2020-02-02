import { WorkspaceExt } from '../workspace';
import { ScopeExt } from '../scope';
import { CapsuleExt } from '../../capsule';
import provideBit from './bit.provider';
import { BuildExt } from '../build';
import { ComposerExt } from '../composer';
import { ReactExtension } from '../react/react.manifest';

export default {
  name: 'Bit',
  dependencies: [WorkspaceExt, ScopeExt, CapsuleExt, BuildExt, ComposerExt, ReactExtension],
  config: {},
  provider: provideBit
};
