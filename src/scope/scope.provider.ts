import { loadConsumer, Consumer } from '../consumer';
import { Scope } from './scope.api';

export type ScopeConfig = {};

export async function provideScope(config: ScopeConfig) {
  const consumer = await loadConsumer();
  return new Scope(consumer);
}
