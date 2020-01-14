import { Extension } from '../harmony';
import provideSnap from './snap.provider';
import ScopeExt from '../scope/scope.extension';
import { WorkspaceExt } from '../workspace';

Extension.instantiate({
  name: 'Snap',
  dependencies: [WorkspaceExt, ScopeExt],
  config: {},
  provider: provideSnap
});
