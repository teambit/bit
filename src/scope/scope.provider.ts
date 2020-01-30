import { loadConsumerIfExist } from '../consumer';
import { Scope } from './scope.api';
import { loadScopeIfExist } from './scope-loader';

export type ScopeConfig = {};

export async function provideScope() {
  const consumer = await loadConsumerIfExist();
  let legacyScope;
  if (consumer) {
    legacyScope = consumer.scope;
  } else {
    legacyScope = loadScopeIfExist();
  }
  if (!legacyScope) {
    return undefined;
  }
  return new Scope(legacyScope);
}
