import { Pipes } from './pipes';
import { BitCliExt } from '../cli';
import { WorkspaceExt } from '../workspace';

export default {
  name: 'pipes',
  dependencies: [BitCliExt, WorkspaceExt],
  provider: Pipes.provide
};
