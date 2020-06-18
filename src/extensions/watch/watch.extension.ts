import { WorkspaceExt } from '../workspace';
import { CompileExt } from '../compiler';
import { provideWatch } from './watch.provider';
import { CLIExtension } from '../cli';

export default {
  name: 'Watch',
  dependencies: [CLIExtension, CompileExt, WorkspaceExt],
  provider: provideWatch
};
