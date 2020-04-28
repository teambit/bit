import { ExtensionManifest } from '@teambit/harmony';
import { WatchExt } from '../watch';
import { provideComposer } from './composer.provider';
import { BitCliExt } from '../cli';
import { WorkspaceExt } from '../workspace';
import { FlowsExt } from '../flows';

export default {
  name: 'Composer',
  dependencies: [WatchExt, BitCliExt, WorkspaceExt, FlowsExt],
  provider: provideComposer
} as ExtensionManifest;
