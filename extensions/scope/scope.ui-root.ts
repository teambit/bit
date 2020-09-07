import { UIRoot } from '@teambit/ui';

import type { ScopeMain } from './scope.main.runtime';

export class ScopeUIRoot implements UIRoot {
  constructor(
    /**
     * scope extension.
     */
    private scope: ScopeMain
  ) {}

  readonly name = 'scope';

  get path(): string {
    return this.scope.path;
  }

  get configFile(): string {
    return 'scope.json';
  }

  resolveAspects(runtime: string) {
    return this.scope.resolveAspects(runtime);
  }

  async resolvePattern() {
    return [];
  }
}
