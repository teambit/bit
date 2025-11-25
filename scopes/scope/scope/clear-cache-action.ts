import type { ScopeMain } from './scope.main.runtime';

export class ClearCacheAction {
  name = ClearCacheAction.name;
  constructor(private scope: ScopeMain) {}
  async execute() {
    if (!this.scope) return false;
    await this.scope.clearCache();
    return true;
  }
}
