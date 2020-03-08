import { BitCliExt } from '../cli';
import { WorkspaceExt } from '../workspace';
import { provideCompile } from './compile.provider';
import { Scripts } from '../scripts';

export default {
  name: 'compile',
  dependencies: [BitCliExt, WorkspaceExt, Scripts],
  provider: provideCompile
};
