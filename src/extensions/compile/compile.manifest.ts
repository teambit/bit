import { BitCli } from '../cli';
import { WorkspaceExt } from '../workspace';
import { FlowsExt } from '../flows';
import { provideCompile } from './compile.provider';
import { Scope } from '../scope';

export default {
  name: 'compile',
  dependencies: [BitCli, WorkspaceExt, FlowsExt, Scope],
  provider: provideCompile
};
