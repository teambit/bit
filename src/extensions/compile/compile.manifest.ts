import { ExtensionManifest } from '@teambit/harmony';
import { BitCliExt } from '../cli';
import { WorkspaceExt } from '../workspace';
import { FlowsExt } from '../flows';
import { provideCompile } from './compile.provider';
import { ScopeExt } from '../scope';

export default {
  name: 'compile',
  dependencies: [BitCliExt, WorkspaceExt, FlowsExt, ScopeExt],
  provider: provideCompile
} as ExtensionManifest;
