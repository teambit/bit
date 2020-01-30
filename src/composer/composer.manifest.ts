import { Extension } from '../harmony';
import { WatchExt } from '../watch';
import { provideComposer } from './composer.provider';
import { PaperExt } from '../extensions/paper';
import { WorkspaceExt } from '../workspace';
import { CapsuleExt } from '../capsule';

export default Extension.instantiate({
  name: 'Composer',
  dependencies: [WatchExt, PaperExt, WorkspaceExt, CapsuleExt],
  config: {},
  provider: provideComposer
});
