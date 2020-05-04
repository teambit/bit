import { BitCliExt } from '@bit/bit.core.cli';
import { WorkspaceExt } from '@bit/bit.core.workspace';
import { CompileExt } from '@bit/bit.core.compile';
import { provideWatch } from './watch.provider';

export default {
  name: 'Watch',
  dependencies: [BitCliExt, CompileExt, WorkspaceExt],
  provider: provideWatch
};
