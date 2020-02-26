import { provide } from './graph.provider';
import { WorkspaceExt } from '../workspace';

export default {
  name: 'graph',
  dependencies: [WorkspaceExt],
  config: {},
  provider: provide
};
