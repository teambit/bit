import { Extension } from '../harmony';
import workspaceProvider from './workspace.provider';
import ScopeExt from '../scope/scope.extension';
import { ComponentFactoryExt } from '../component';

export default Extension.instantiate({
  name: 'Workspace',
  dependencies: [ScopeExt, ComponentFactoryExt],
  config: {
    defaultScope: ''
  },
  provider: workspaceProvider
});
