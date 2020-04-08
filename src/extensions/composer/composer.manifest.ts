import { WatchExt } from '../watch';
import { provideComposer } from './composer.provider';
import { BitCli } from '../cli';
import { WorkspaceExt } from '../workspace';
import { FlowsExt } from '../flows';

export default {
  name: 'Composer',
  dependencies: [WatchExt, BitCli, WorkspaceExt, FlowsExt],
  provider: provideComposer
};
