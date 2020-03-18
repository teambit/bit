import { BitCliExt } from '../cli';
import { WorkspaceExt } from '../workspace';
import { provideCompile } from './compile.provider';
import { FlowsExt } from '../flows';

export default {
  name: 'compile',
  dependencies: [BitCliExt, WorkspaceExt, FlowsExt],
  provider: provideCompile
};
