import { Harmony } from '../../harmony';
// import WorkspaceConfig from './workspace-config';
import { getConsumerInfo } from '../../consumer/consumer-locator';

export type WorkspaceConfigDeps = [];

export type WorkspaceConfigConfig = {};

export default async function provideWorkspaceConfig(
  _config: WorkspaceConfigConfig,
  _deps: WorkspaceConfigDeps,
  harmony: Harmony<unknown>
) {
  // Using the getConsumerInfo since it is doing propagation until it finds the config
  const workspaceInfo = await getConsumerInfo(process.cwd());
  if (workspaceInfo && workspaceInfo.consumerConfig) {
    const config = workspaceInfo.consumerConfig;
    const coreExtensionsConfig = config.getCoreExtensionsConfig();
    console.log(coreExtensionsConfig);
    harmony.setExtensionsConfig(coreExtensionsConfig);
    return config;
  }
  return undefined;
}
