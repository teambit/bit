import { UIRoot } from '@teambit/ui';

import type { ScopeMain } from './scope.main.runtime';

export class ScopeUIRoot implements UIRoot {
  constructor(
    /**
     * scope extension.
     */
    private scope: ScopeMain
  ) {}

  get name() {
    return this.scope.name;
  }

  get path(): string {
    return this.scope.path;
  }

  get configFile(): string {
    return 'scope.jsonc';
  }

  get devServers() {
    return Promise.resolve([]);
  }

  buildOptions = {
    ssr: true,
  };

  resolveAspects(runtime: string) {
    return this.scope.resolveAspects(runtime);
  }

  async resolvePattern() {
    return [];
  }
}
