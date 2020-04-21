import { WatchExt } from '@bit/bit.core.watch';
import { provideComposer } from './composer.provider';
import { BitCliExt } from '@bit/bit.core.cli';
import { WorkspaceExt } from '@bit/bit.core.workspace';
import { FlowsExt } from '@bit/bit.core.flows';

export default {
  name: 'Composer',
  dependencies: [WatchExt, BitCliExt, WorkspaceExt, FlowsExt],
  provider: provideComposer
};
