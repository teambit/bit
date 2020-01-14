import { Extension } from '../harmony';
import { WorkspaceExt } from '../workspace';
import ScopeExt from '../scope/scope.extension';
import CapsuleExt from '../environment/capsule.extension';
import { SnapExt } from '../snap';
import provideBit from './bit.provider';
import { PipesExt } from '../pipes';

export default Extension.instantiate({
  name: 'Bit',
  dependencies: [WorkspaceExt, ScopeExt, CapsuleExt, SnapExt, PipesExt],
  config: {},
  provider: provideBit
});
