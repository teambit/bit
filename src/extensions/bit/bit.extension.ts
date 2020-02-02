import { Extension } from '../../harmony';
import { WorkspaceExt } from '../../extensions/workspace';
import { ScopeExt } from '../scope';
import { CapsuleExt } from '../capsule';
import provideBit from './bit.provider';

export default Extension.instantiate({
  name: 'Bit',
  dependencies: [WorkspaceExt, ScopeExt, CapsuleExt],
  config: {},
  provider: provideBit
});
