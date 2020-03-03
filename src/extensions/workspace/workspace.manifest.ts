import workspaceProvider from './workspace.provider';
import { ScopeExt } from '../scope';
import { ComponentFactoryExt } from '../component';
import { NetworkExt } from '../network';

export default {
  name: 'workspace',
  dependencies: [ScopeExt, ComponentFactoryExt, NetworkExt],
  provider: workspaceProvider
};
