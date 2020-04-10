import { provide } from './graph.provider';
import { WorkspaceExt } from '../workspace';
import { Scope } from '../scope';
import { ComponentFactoryExt } from '../component';

export default {
  name: 'graph',
  dependencies: [WorkspaceExt, Scope, ComponentFactoryExt],
  provider: provide
};
