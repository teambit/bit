import workspaceProvider from './workspace.provider';
import { ScopeExt } from '../scope';
import { ComponentFactoryExt } from '../component';
import { IsolatorExt } from '../isolator';
import { WorkspaceConfigExt } from '../workspace-config';

export default {
  name: 'workspace',
  dependencies: [WorkspaceConfigExt, ScopeExt, ComponentFactoryExt, IsolatorExt],
  provider: workspaceProvider
};
