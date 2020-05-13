import { Harmony } from '@teambit/harmony';
import { Workspace } from '../workspace';
import { Scope } from '../scope';
import { Config } from '../config';
import { Logger } from '../logger';

import Core from './core';

export type CoreDeps = [Config, Logger, Workspace, Scope];

export type CoreConfig = {};

export default async function provideCore([config, logger, workspace, scope]: CoreDeps, _config, harmony: Harmony) {
  const core = new Core(harmony, config, logger.createLogPublisher('core'), scope, workspace);
  core.init();
  return core;
}
