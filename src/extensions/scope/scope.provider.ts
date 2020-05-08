import { Scope } from './scope';
import { loadScopeIfExist } from '../../scope/scope-loader';

export type ScopeConfig = {};

export async function provideScope() {
  const legacyScope = await loadScopeIfExist();
  if (!legacyScope) {
    return undefined;
  }

  return new Scope(legacyScope);
}
