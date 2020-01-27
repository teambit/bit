import { Extension } from '../harmony';
import workspaceProvider from './workspace.provider';
import ScopeExt from '../scope/scope.extension';
import { ComponentFactoryExt } from '../component';
import { PaperExt } from '../paper';

export default Extension.instantiate({
  name: 'Workspace',
  dependencies: [ScopeExt, ComponentFactoryExt, PaperExt],
  config: {
    defaultScope: ''
  },
  provider: workspaceProvider
});
