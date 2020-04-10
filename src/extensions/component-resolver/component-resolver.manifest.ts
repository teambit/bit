import componentResolverProvider from './component-resolver.provider';
import { WorkspaceExt } from '../../extensions/workspace';
import { Scope } from '../scope';

export default {
  name: 'ComponentResolver',
  dependencies: [WorkspaceExt, Scope],
  provider: componentResolverProvider
};
