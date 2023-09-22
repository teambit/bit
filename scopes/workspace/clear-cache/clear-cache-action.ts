import { ScopeMain } from '@teambit/scope';

export class ClearCacheAction {
  name = ClearCacheAction.name;
  constructor(private scope: ScopeMain) {}
  async execute() {
    if (!this.scope) return false;
    await this.scope.clearCache();
    return true;
  }
}
