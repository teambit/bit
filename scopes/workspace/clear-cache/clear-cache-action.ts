import { ScopeMain } from '@teambit/scope';

export class ClearCacheAction {
  name = ClearCacheAction.name;
  constructor(private scope: ScopeMain) {}
  execute() {
    if (!this.scope) return false;
    this.scope.clearCache();
    return true;
  }
}
