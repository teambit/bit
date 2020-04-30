import { ExtensionManifest } from '@teambit/harmony';
import { BitCliExt } from '../cli';
import { WorkspaceExt } from '../workspace';
import { provideCreate } from './create.provider';

export default {
  name: 'create',
  dependencies: [BitCliExt, WorkspaceExt],
  provider: provideCreate
} as ExtensionManifest;
