import { BitCli } from '../cli';
import { WorkspaceExt } from '../workspace';
import { provideCreate } from './create.provider';

export default {
  name: 'create',
  dependencies: [BitCli, WorkspaceExt],
  provider: provideCreate
};
