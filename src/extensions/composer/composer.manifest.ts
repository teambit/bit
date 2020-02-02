import { WatchExt } from '../watch';
import { provideComposer } from './composer.provider';
import { BitCliExt } from '../cli';
import { WorkspaceExt } from '../workspace';
import { BuildExt } from '../build';

export default {
  name: 'Composer',
  dependencies: [WatchExt, BitCliExt, WorkspaceExt, BuildExt],
  config: {},
  provider: provideComposer
};
