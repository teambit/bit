import { ExtensionManifest } from '@teambit/harmony';
import { CoreAspect } from './core.aspect';
import { MainRuntime } from '../cli/cli.aspect';
import { WorkspaceAspect } from '../workspace';
import { ScopeExtension } from '../scope';
import provideCore from './core.provider';
import { LoggerExtension } from '../logger';
import { ConfigExt } from '../config';

export default {
  name: 'core',
  runtime: MainRuntime,
  dependencies: [ConfigExt, LoggerExtension, WorkspaceAspect, ScopeExtension],
  provider: provideCore,
} as ExtensionManifest;

CoreAspect.addRuntime(CoreMain);
