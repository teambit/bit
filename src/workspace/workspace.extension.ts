import { Extension } from '../harmony';
import workspaceProvider from './workspace.provider';
import ScopeExt from '../scope/scope.extension';

export default Extension.instantiate({
  name: 'Workspace',
  dependencies: [ScopeExt],
  config: {},
  provider: workspaceProvider
});
