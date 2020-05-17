import { Harmony } from '@teambit/harmony';
import { Workspace } from '../workspace';
import { Scope } from '../scope';
import { Config } from '../config';
import { Logger } from '../logger';

import Core from './core';

export type CoreDeps = [Config, Logger, Workspace, Scope];

export type CoreConfig = {};

export default async function provideCore(
  [config, logger, workspace, scope]: CoreDeps,
  _config,
  _slots,
  harmony: Harmony
) {
  // TODO: change to get the maybe value
  const actualConfig = config.type ? config : undefined;
  const core = new Core(harmony, actualConfig, logger.createLogPublisher('core'), scope, workspace);
  core.init();
  return core;
}
