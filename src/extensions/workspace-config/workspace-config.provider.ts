// import WorkspaceConfig from './workspace-config';
import { getConsumerInfo } from '../../consumer/consumer-locator';

export type WorkspaceConfigDeps = [];

export type WorkspaceConfigConfig = {};

export default async function provideWorkspaceConfig() {
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
