import { Harmony } from '@teambit/harmony';
import { Workspace } from '../workspace';
import { Config } from '../config';
import Core from './core';
import { LoggerMain } from '../logger';
import { ScopeMain } from '../scope';

export type CoreDeps = [Config, LoggerMain, Workspace, ScopeMain];

export type CoreConfig = {};

export default async function provideCore(
  [config, logger, workspace, scope]: CoreDeps,
  _config,
  _slots,
  harmony: Harmony
) {
  // TODO: change to get the maybe value
  const actualConfig = config.type ? config : undefined;
  const core = new Core(harmony, actualConfig, logger.createLogger('core'), scope, workspace);
  await core.init();
  return core;
}
