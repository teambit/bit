import { MainRuntime } from '@teambit/cli';
import { BASE_COMMUNITY_DOMAIN, BASE_DOCS_DOMAIN } from '@teambit/legacy.constants';
// import { HelloWorldStarter } from '@teambit/community.starters.hello-world';
// import { } from '@teambit/community.starters.hello-world-angular';
// import {} from '@learnbit-vue/hello-world.starters.hello-world';
// import {} from '@teambit/community.starters.wiki';
// import {} from '@teambit/community.starters.data-fetching';
// import {} from '@teambit/community.starters.analytics';
import type { GeneratorMain } from '@teambit/generator';
import { GeneratorAspect } from '@teambit/generator';

import { CommunityAspect } from './community.aspect';

export interface CommunityWorkspaceConfig {
  communityDomain: string;
  docsDomain: string;
}

export class CommunityMain {
  constructor(
    private config: CommunityWorkspaceConfig // private generator: GeneratorMain
  ) {}

  getBaseDomain(): string {
    return this.config.communityDomain;
  }

  getDocsDomain(): string {
    return this.config.docsDomain;
  }

  static slots = [];
  static dependencies = [GeneratorAspect];
  static runtime = MainRuntime;
  static defaultConfig: CommunityWorkspaceConfig = {
    communityDomain: BASE_COMMUNITY_DOMAIN,
    docsDomain: BASE_DOCS_DOMAIN,
  };

  static async provider(_deps: [GeneratorMain], config: CommunityWorkspaceConfig) {
    // const [generator] = _deps;
    const community = new CommunityMain(config);

    // if (generator) generator.registerWorkspaceTemplate([HelloWorldStarter]);

    return community;
  }
}

CommunityAspect.addRuntime(CommunityMain);
