import { BitCliExt } from '../cli';
import { WorkspaceExt } from '../workspace';
import { provideCompile } from './compile.provider';

export default {
  name: '@compile',
  actions: {
    default: () => console.log('hi there')
  },
  dependencies: [BitCliExt, WorkspaceExt],
  provider: provideCompile
};
