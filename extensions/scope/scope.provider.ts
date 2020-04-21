import { loadConsumerIfExist } from 'bit-bin/dist/consumer';
import { Scope } from './scope';
import { loadScopeIfExist } from 'bit-bin/dist/scope/scope-loader';

export type ScopeConfig = {};

export async function provideScope() {
  // This is wrapped since there are cases when there is no scope, or something in the scope is invalid
  // Those will be handled later
  try {
    const consumer = await loadConsumerIfExist();
    let legacyScope;
    if (consumer) {
      legacyScope = consumer.scope;
    } else {
      legacyScope = await loadScopeIfExist();
    }
    if (!legacyScope) {
      return undefined;
    }

    return new Scope(legacyScope);
  } catch {
    return undefined;
  }
}
