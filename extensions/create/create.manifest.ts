import { BitCliExt } from '@bit/bit.core.cli';
import { WorkspaceExt } from '@bit/bit.core.workspace';
import { provideCreate } from './create.provider';

export default {
  name: 'create',
  dependencies: [BitCliExt, WorkspaceExt],
  provider: provideCreate
};
