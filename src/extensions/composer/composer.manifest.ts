import { WatchExt } from '../watch';
import { provideComposer } from './composer.provider';
import { BitCliExt } from '../cli';
import { WorkspaceExt } from '../workspace';
import { PipesExt } from '../pipes';

export default {
  name: 'Composer',
  dependencies: [WatchExt, BitCliExt, WorkspaceExt, PipesExt],
  config: {},
  provider: provideComposer
};
