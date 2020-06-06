import { ExtensionManifest } from '@teambit/harmony';
import { BitCliExt } from '../cli';
import { WorkspaceExt } from '../workspace';
import { provideCompile } from './compile.provider';
import { Environments } from '../environments';

export default {
  name: 'compile',
  dependencies: [BitCliExt, WorkspaceExt, Environments],
  provider: provideCompile
} as ExtensionManifest;
