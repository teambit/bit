import { Extension } from '../../extensions/harmony';
import componentGraphBuilderProvider from './component-graph-builder.provider';
import { ComponentResolverExt } from '../component-resolver-ext';

export default Extension.instantiate({
  name: 'ComponentGraphBuilder',
  dependencies: [ComponentResolverExt],
  config: {},
  provider: componentGraphBuilderProvider
});
