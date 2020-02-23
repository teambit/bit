import { BitCliExt } from '../cli';
import { WorkspaceExt } from '../workspace';
import { provideCompile } from './compile.provider';
import { ScriptsExt } from '../scripts';

export default {
  name: 'compile',
  dependencies: [BitCliExt, WorkspaceExt, ScriptsExt],
  provider: provideCompile
};
