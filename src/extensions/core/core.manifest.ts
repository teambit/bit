import { ExtensionManifest } from '@teambit/harmony';
import { WorkspaceExt } from '../workspace';
import { ScopeExt } from '../scope';
import provideCore from './core.provider';
import { LoggerExt } from '../logger';

export default {
  name: 'core',
  dependencies: [LoggerExt, WorkspaceExt, ScopeExt],
  provider: provideCore
} as ExtensionManifest;
