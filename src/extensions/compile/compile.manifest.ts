import { BitCliExt } from '../cli';
import { WorkspaceExt } from '../workspace';
import { provideCompile } from './compile.provider';
import { ScriptsExt } from '../scripts';
import { ScopeExt } from '../scope';

export default {
  name: 'compile',
  dependencies: [BitCliExt, WorkspaceExt, ScriptsExt, ScopeExt],
  provider: provideCompile
};
