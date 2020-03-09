import { BitCliExt } from '../cli';
import { WorkspaceExt } from '../workspace';
import { Compile } from '../compile';
import { provideTest } from './test.provider';

export default {
  name: 'test',
  dependencies: [BitCliExt, Compile, WorkspaceExt],
  provider: provideTest
};
