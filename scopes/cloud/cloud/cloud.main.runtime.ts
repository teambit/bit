import { MainRuntime } from '@teambit/cli';
import {
  getCloudDomain,
  DEFAULT_HUB_DOMAIN,
  getSymphonyUrl,
  SYMPHONY_GRAPHQL,
  DEFAULT_HUB_LOGIN,
  DEFAULT_ANALYTICS_DOMAIN,
  DEFAULT_REGISTRY_URL,
  CENTRAL_BIT_HUB_URL,
  CENTRAL_BIT_HUB_NAME,
} from '@teambit/legacy/dist/constants';

import { CloudAspect } from './cloud.aspect';

export interface CloudWorkspaceConfig {
  cloudDomain: string;
  cloudHubDomain: string;
  cloudApi: string;
  cloudGraphQL: string;
  loginDomain: string;
  analyticsDomain: string;
  registryUrl: string;
  cloudExporterUrl: string;
  cloudHubName: string;
}

export class CloudMain {
  constructor(private config: CloudWorkspaceConfig) {}

  getCloudDomain(): string {
    return this.config.cloudDomain;
  }

  getCloudHubDomain(): string {
    return this.config.cloudHubDomain;
  }

  getCloudApi(): string {
    return this.config.cloudApi;
  }

  getCloudGraphQL(): string {
    return this.config.cloudGraphQL;
  }
  getLoginDomain(): string {
    return this.config.loginDomain;
  }

  getAnalyticsDomain(): string {
    return this.config.analyticsDomain;
  }

  getRegistryUrl(): string {
    return this.config.registryUrl;
  }

  getCloudExporterUrl(): string {
    return this.config.cloudExporterUrl;
  }

  getHubName(): string {
    return this.config.cloudHubName;
  }

  static slots = [];
  static dependencies = [];
  static runtime = MainRuntime;
  static defaultConfig: CloudWorkspaceConfig = {
    cloudDomain: getCloudDomain(),
    cloudHubDomain: DEFAULT_HUB_DOMAIN,
    cloudApi: getSymphonyUrl(),
    cloudGraphQL: SYMPHONY_GRAPHQL,
    loginDomain: DEFAULT_HUB_LOGIN,
    analyticsDomain: DEFAULT_ANALYTICS_DOMAIN,
    registryUrl: DEFAULT_REGISTRY_URL,
    cloudExporterUrl: CENTRAL_BIT_HUB_URL,
    cloudHubName: CENTRAL_BIT_HUB_NAME,
  };
  static async provider(_deps, config: CloudWorkspaceConfig) {
    return new CloudMain(config);
  }
}

CloudAspect.addRuntime(CloudMain);
