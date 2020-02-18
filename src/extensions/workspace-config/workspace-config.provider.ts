import { Harmony } from '../../harmony';
import WorkspaceConfig from './workspace-config';

export type WorkspaceConfigDeps = [];

export type WorkspaceConfigConfig = {};

export default async function provideWorkspaceConfig(
  _config: WorkspaceConfigConfig,
  _deps: WorkspaceConfigDeps,
  harmony: Harmony<unknown>
) {
  const config = new WorkspaceConfig();
  // harmony.setExtensionsConfig(config.getCoreExtensionsConfig());
  return config;
}
