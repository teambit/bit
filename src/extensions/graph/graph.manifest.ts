import { provide } from './graph.provider';
import { WorkspaceExt } from '../workspace';
import { ComponentFactoryExt } from '../component';

export default {
  name: 'graph',
  dependencies: [WorkspaceExt, ComponentFactoryExt],
  config: {},
  provider: provide
};
