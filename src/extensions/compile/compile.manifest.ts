import { BitCliExt } from '../cli';
import { WorkspaceExt } from '../workspace';
import { provideCompile } from './compile.provider';

export default {
  name: 'compile',
  dependencies: [BitCliExt, WorkspaceExt],
  provider: provideCompile
};
