import { ExtensionManifest } from '@teambit/harmony';
import { WorkspaceExt } from '@teambit/workspace';
import { provideCreate } from './create.provider';
import { CLIExtension } from '@teambit/cli';

export default {
  name: '@teambit/create',
  dependencies: [CLIExtension, WorkspaceExt],
  provider: provideCreate,
} as ExtensionManifest;
