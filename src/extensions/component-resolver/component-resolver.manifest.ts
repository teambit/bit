import { Extension } from '../../harmony';
import componentResolverProvider from './component-resolver.provider';
import { WorkspaceExt } from '../../extensions/workspace';
import { ScopeExt } from '../scope';

export default Extension.instantiate({
  name: 'ComponentResolver',
  dependencies: [WorkspaceExt, ScopeExt],
  config: {},
  provider: componentResolverProvider
});
