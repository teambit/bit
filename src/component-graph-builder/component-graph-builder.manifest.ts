import { Extension } from '../harmony';
import componentGraphBuilderProvider from './component-graph-builder.provider';
import { BitExt } from '../bit';

export default Extension.instantiate({
  name: 'ComponentGraphBuilder',
  dependencies: [BitExt],
  config: {},
  provider: componentGraphBuilderProvider
});
