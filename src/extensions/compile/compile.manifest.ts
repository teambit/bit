import { ExtensionManifest } from '@teambit/harmony';
import { WorkspaceExt } from '../workspace';
import { provideCompile } from './compile.provider';
import { Environments } from '../environments';
import { PaperExtension } from '../paper';

export default {
  name: 'compile',
  dependencies: [PaperExtension, WorkspaceExt, Environments],
  provider: provideCompile
} as ExtensionManifest;
