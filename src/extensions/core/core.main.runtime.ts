import { CoreAspect } from './core.aspect';
import { MainRuntime } from '../cli/cli.aspect';
import { WorkspaceAspect } from '../workspace';
import provideCore from './core.provider';
import { ConfigAspect } from '../config';
import { LoggerAspect } from '../logger';
import { ScopeAspect } from '../scope';

export const CoreMain = {
  name: 'core',
  runtime: MainRuntime,
  dependencies: [ConfigAspect, LoggerAspect, WorkspaceAspect, ScopeAspect],
  provider: provideCore,
};

CoreAspect.addRuntime(CoreMain);
