import { WorkspaceExt } from '../workspace';
import { CompileExt } from '../compile';
import { provideWatch } from './watch.provider';
import { CLIExtension } from '../cli';

export default {
  name: 'Watch',
  dependencies: [CLIExtension, CompileExt, WorkspaceExt],
  provider: provideWatch
};
