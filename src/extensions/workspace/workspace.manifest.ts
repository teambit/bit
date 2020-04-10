import workspaceProvider from './workspace.provider';
import { Scope } from '../scope';
import { ComponentFactoryExt } from '../component';
import { IsolatorExt } from '../isolator';
import { WorkspaceConfigExt } from '../workspace-config';
import { ReporterExt } from '../reporter';

export default {
  name: 'workspace',
  dependencies: [WorkspaceConfigExt, Scope, ComponentFactoryExt, IsolatorExt, ReporterExt],
  provider: workspaceProvider
};
