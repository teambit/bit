import componentResolverProvider from './component-resolver.provider';
import { WorkspaceExt } from '../../extensions/workspace';
import { ScopeExt } from '../scope';

export default {
  name: 'ComponentResolver',
  dependencies: [WorkspaceExt, ScopeExt],
  provider: componentResolverProvider
};
