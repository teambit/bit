import { ResolveAspectsOptions } from '@teambit/component';
import { ComponentID } from '@teambit/component-id';
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
    prebundle: false,
  };

  resolveAspects(runtime: string, componentIds?: ComponentID[], opts?: ResolveAspectsOptions) {
    return this.scope.resolveAspects(runtime, componentIds, opts);
  }

  async resolvePattern() {
    return [];
  }
}
