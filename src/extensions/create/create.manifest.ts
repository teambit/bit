import { ExtensionManifest } from '@teambit/harmony';
import { WorkspaceExt } from '../workspace';
import { provideCreate } from './create.provider';
import { PaperExtension } from '../paper';

export default {
  name: '@teambit/create',
  dependencies: [PaperExtension, WorkspaceExt],
  provider: provideCreate
} as ExtensionManifest;
