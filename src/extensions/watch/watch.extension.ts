import { BitCliExt } from '../cli';
import { WorkspaceExt } from '../workspace';
import { CompileExt } from '../compile';
import { provideWatch } from './watch.provider';

export default {
  name: 'Watch',
  dependencies: [BitCliExt, CompileExt, WorkspaceExt],
  provider: provideWatch
};
