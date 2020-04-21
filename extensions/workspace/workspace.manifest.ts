import workspaceProvider from './workspace.provider';
import { ScopeExt } from '@bit/bit.core.scope';
import { ComponentFactoryExt } from '@bit/bit.core.component';
import { IsolatorExt } from '@bit/bit.core.isolator';
import { WorkspaceConfigExt } from '@bit/bit.core.workspace-config';
import { ReporterExt } from '@bit/bit.core.reporter';

export default {
  name: 'workspace',
  dependencies: [WorkspaceConfigExt, ScopeExt, ComponentFactoryExt, IsolatorExt, ReporterExt],
  provider: workspaceProvider
};
