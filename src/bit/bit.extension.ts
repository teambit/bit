import { Extension } from '../harmony';
import { WorkspaceExt } from '../workspace';
import ScopeExt from '../scope/scope.extension';
import provideBit from './bit.provider';

export default Extension.instantiate({
  name: 'Bit',
  dependencies: [WorkspaceExt, ScopeExt],
  config: {},
  provider: provideBit
});
