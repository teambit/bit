import { BitCliExt } from '../cli';
import { WorkspaceExt } from '../workspace';
import { CompileExt } from '../compile';
import { provideTest } from './test.provider';

export default {
  name: 'test',
  dependencies: [BitCliExt, CompileExt, WorkspaceExt],
  provider: provideTest
};
