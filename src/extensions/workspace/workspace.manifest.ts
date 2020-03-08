import workspaceProvider from './workspace.provider';
import { ScopeExt } from '../scope';
import { ComponentFactoryExt } from '../component';
import { IsolatorExt } from '../isolator';

export default {
  name: 'workspace',
  dependencies: [ScopeExt, ComponentFactoryExt, IsolatorExt],
  provider: workspaceProvider
};
