import { ExtensionManifest } from '@teambit/harmony';
import { WorkspaceExt } from '../workspace';
import { provideCompile } from './compile.provider';
import { Environments } from '../environments';
import { CLIExtension } from '../cli';

export default {
  name: 'compile',
  dependencies: [CLIExtension, WorkspaceExt, Environments],
  provider: provideCompile
} as ExtensionManifest;
