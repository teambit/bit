import workspaceProvider from './workspace.provider';
import { ScopeExt } from '../scope';
import { ComponentFactoryExt } from '../component';
import { IsolatorExt } from '../isolator';
import { ReporterExt } from '../reporter';

export default {
  name: 'workspace',
  dependencies: [ScopeExt, ComponentFactoryExt, IsolatorExt, ReporterExt],
  provider: workspaceProvider
};
