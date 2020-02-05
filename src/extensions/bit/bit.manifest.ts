import { WorkspaceExt } from '../workspace';
import { ScopeExt } from '../scope';
import { CapsuleExt } from '../capsule';
import provideBit from './bit.provider';
import { PipesExt } from '../pipes';
import { ComposerExt } from '../composer';
import { ReactExtension } from '../react/react.manifest';

export default {
  name: 'Bit',
  dependencies: [WorkspaceExt, ScopeExt, CapsuleExt, PipesExt, ComposerExt, ReactExtension],
  config: {},
  provider: provideBit
};
