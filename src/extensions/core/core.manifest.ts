import { ExtensionManifest } from '@teambit/harmony';
import { WorkspaceExt } from '../workspace';
import { ScopeExtension } from '../scope';
import provideCore from './core.provider';
import { LoggerExtension } from '../logger';
import { ConfigExt } from '../config';

export default {
  name: 'core',
  dependencies: [ConfigExt, LoggerExtension, WorkspaceExt, ScopeExtension],
  provider: provideCore,
} as ExtensionManifest;
