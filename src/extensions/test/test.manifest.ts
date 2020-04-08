import { BitCli } from '../cli';
import { WorkspaceExt } from '../workspace';
import { CompileExt } from '../compile';
import { provideTest } from './test.provider';

export default {
  name: 'test',
  dependencies: [BitCli, CompileExt, WorkspaceExt],
  provider: provideTest
};
