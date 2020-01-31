import { WatchExt } from '../watch';
import { provideComposer } from './composer.provider';
import { PaperExt } from '../paper';
import { WorkspaceExt } from '../workspace';
import { CapsuleExt } from '../../capsule';

export default {
  name: 'Composer',
  dependencies: [WatchExt, PaperExt, WorkspaceExt, CapsuleExt],
  config: {},
  provider: provideComposer
};
