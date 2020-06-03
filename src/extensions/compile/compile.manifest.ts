import { ExtensionManifest } from '@teambit/harmony';
import { BitCliExt } from '../cli';
import { WorkspaceExt } from '../workspace';
import { FlowsExt } from '../flows';
import { provideCompile } from './compile.provider';
import { ScopeExt } from '../scope';
import { Environments } from '../environments';

export default {
  name: 'compile',
  dependencies: [BitCliExt, WorkspaceExt, FlowsExt, ScopeExt, Environments],
  provider: provideCompile
} as ExtensionManifest;
