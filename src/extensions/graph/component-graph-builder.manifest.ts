import componentGraphBuilderProvider from './component-graph-builder.provider';
import { ComponentResolverExt } from '../component-resolver';

export default {
  name: 'ComponentGraphBuilder',
  dependencies: [ComponentResolverExt],
  config: {},
  provider: componentGraphBuilderProvider
};
