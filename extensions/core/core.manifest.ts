import { ExtensionManifest } from '@teambit/harmony';
import { WorkspaceExt } from '@teambit/workspace';
import { ScopeExtension } from '@teambit/scope';
import provideCore from './core.provider';
import { LoggerExtension } from '@teambit/logger';
import { ConfigExt } from '@teambit/config';

export default {
  name: 'core',
  dependencies: [ConfigExt, LoggerExtension, WorkspaceExt, ScopeExtension],
  provider: provideCore,
} as ExtensionManifest;
