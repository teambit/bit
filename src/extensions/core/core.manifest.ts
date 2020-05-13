import { ExtensionManifest } from '@teambit/harmony';
import { WorkspaceExt } from '../workspace';
import { ScopeExt } from '../scope';
import provideCore from './core.provider';
import { LoggerExt } from '../logger';
import { ConfigExt } from '../config';

export default {
  name: 'core',
  dependencies: [ConfigExt, LoggerExt, WorkspaceExt, ScopeExt],
  provider: provideCore
} as ExtensionManifest;
