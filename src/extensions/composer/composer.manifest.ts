import { WatchExt } from '../watch';
import { provideComposer } from './composer.provider';
import { BitCliExt } from '../cli';
import { WorkspaceExt } from '../workspace';
import { ScriptsExt } from '../scripts';

export default {
  name: 'Composer',
  dependencies: [WatchExt, BitCliExt, WorkspaceExt, ScriptsExt],
  config: {},
  provider: provideComposer
};
