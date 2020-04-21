import componentResolverProvider from './component-resolver.provider';
import { WorkspaceExt } from '@bit/bit.core.workspace';
import { ScopeExt } from '@bit/bit.core.scope';

export default {
  name: 'ComponentResolver',
  dependencies: [WorkspaceExt, ScopeExt],
  provider: componentResolverProvider
};
