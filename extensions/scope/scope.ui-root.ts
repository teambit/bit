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

  resolveAspects(runtime: string) {
    return this.scope.resolveAspects(runtime);
  }

  get extensionsPaths() {
    return [];
  }

  get aspectPaths() {
    return [];
  }

  async resolvePattern() {
    return [];
  }
}
