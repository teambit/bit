import { BitCliExt } from '@bit/bit.core.cli';
import { WorkspaceExt } from '@bit/bit.core.workspace';
import { CompileExt } from '@bit/bit.core.compile';
import { provideTest } from './test.provider';

export default {
  name: 'test',
  dependencies: [BitCliExt, CompileExt, WorkspaceExt],
  provider: provideTest
};
