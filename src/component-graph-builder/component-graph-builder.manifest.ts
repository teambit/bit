import { Extension } from '../harmony';
import componentGraphBuilderProvider from './component-graph-builder.provider';
import { ComponentResolverExt } from '../component-resolver-ext';

export default Extension.instantiate({
  name: 'ComponentGraphBuilder',
  dependencies: [ComponentResolverExt],
  config: {},
  provider: componentGraphBuilderProvider
});
