import { loadConsumerIfExist } from '../consumer';
import { Scope } from './scope.api';

export type ScopeConfig = {};

export async function provideScope() {
  const consumer = await loadConsumerIfExist();
  return new Scope(consumer);
}
