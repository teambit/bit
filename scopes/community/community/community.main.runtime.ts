import { MainRuntime } from '@teambit/cli';
import { BASE_COMMUNITY_DOMAIN, BASE_DOCS_DOMAIN } from '@teambit/legacy/dist/constants';

import { CommunityAspect } from './community.aspect';

export interface CommunityWorkspaceConfig {
  communityDomain: string;
  docsDomain: string;
}

export class CommunityMain {
  constructor(private config: CommunityWorkspaceConfig) {}

  getBaseDomain(): string {
    return this.config.communityDomain;
  }

  getDocsDomain(): string {
    return this.config.docsDomain;
  }

  static slots = [];
  static dependencies = [];
  static runtime = MainRuntime;
  static defaultConfig: CommunityWorkspaceConfig = {
    communityDomain: BASE_COMMUNITY_DOMAIN,
    docsDomain: BASE_DOCS_DOMAIN,
  };
  static async provider(_deps, config: CommunityWorkspaceConfig) {
    return new CommunityMain(config);
  }
}

CommunityAspect.addRuntime(CommunityMain);
