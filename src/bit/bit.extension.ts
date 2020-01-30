import { Extension } from '../harmony';
import { WorkspaceExt } from '../workspace';
import ScopeExt from '../scope/scope.extension';
import { CapsuleExt } from '../capsule';
import provideBit from './bit.provider';

export default Extension.instantiate({
  name: 'Bit',
  dependencies: [WorkspaceExt, ScopeExt, CapsuleExt],
  config: {},
  provider: provideBit
});
