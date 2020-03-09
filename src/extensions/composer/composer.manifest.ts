import { WatchExt } from '../watch';
import { provideComposer } from './composer.provider';
import { BitCliExt } from '../cli';
import { WorkspaceExt } from '../workspace';
import { Scripts } from '../scripts';

export default {
  name: 'Composer',
  dependencies: [WatchExt, BitCliExt, WorkspaceExt, Scripts],
  provider: provideComposer
};
