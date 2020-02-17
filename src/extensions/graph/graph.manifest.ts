import { ComponentFactory } from '../component';
import Graph from './graph';
import { BitCliExt } from '../cli';
import { WorkspaceExt } from '../workspace';

export default {
  name: 'graph',
  dependencies: [ComponentFactory, BitCliExt, WorkspaceExt],
  config: {},
  provider: Graph.provide
};
