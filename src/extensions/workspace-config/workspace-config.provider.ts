// import WorkspaceConfig from './workspace-config';
import { getConsumerInfo } from '../../consumer/consumer-locator';
import LegacyWorkspaceConfig from '../../consumer/config/workspace-config';
import WorkspaceConfig from './workspace-config';

export type WorkspaceConfigDeps = [];

export type WorkspaceConfigConfig = {};

export default async function provideWorkspaceConfig() {
  LegacyWorkspaceConfig.registerOnWorkspaceConfigLoading(WorkspaceConfig.loadIfExist);
  LegacyWorkspaceConfig.registerOnWorkspaceConfigEnsuring(WorkspaceConfig.onLegacyEnsure);
  // Using the getConsumerInfo since it is doing propagation until it finds the config
  try {
    const workspaceInfo = await getConsumerInfo(process.cwd());
    if (workspaceInfo && workspaceInfo.consumerConfig) {
      const config = workspaceInfo.consumerConfig;
      // const coreExtensionsConfig = config.getCoreExtensionsConfig();
      // harmony.setExtensionsConfig(coreExtensionsConfig);
      return config;
    }
  } catch (e) {
    return undefined;
  }
  return undefined;
}
