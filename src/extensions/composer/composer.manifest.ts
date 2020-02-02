import { WatchExt } from '../watch';
import { provideComposer } from './composer.provider';
import { PaperExt } from '../paper';
import { WorkspaceExt } from '../workspace';
import { CapsuleExt } from '../../capsule';
import { BuildExt } from '../build';

export default {
  name: 'Composer',
  dependencies: [WatchExt, PaperExt, WorkspaceExt, BuildExt],
  config: {},
  provider: provideComposer
};
