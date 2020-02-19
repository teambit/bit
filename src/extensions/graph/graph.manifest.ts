import { ComponentFactoryExt } from '../component';
import { Graph } from './graph';
import { BitCliExt } from '../cli';
import { WorkspaceExt } from '../workspace';

export default {
  name: 'graph',
  dependencies: [ComponentFactoryExt, BitCliExt, WorkspaceExt],
  config: {},
  provider: Graph.provide
};
