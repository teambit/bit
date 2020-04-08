import { BitCli } from '../cli';
import { WorkspaceExt } from '../workspace';
import { FlowsExt } from '../flows';
import { provideCompile } from './compile.provider';
import { ScopeExt } from '../scope';

export default {
  name: 'compile',
  dependencies: [BitCli, WorkspaceExt, FlowsExt, ScopeExt],
  provider: provideCompile
};
