/** @flow */
import type {
  DependencyStatusResult,
  DependencyStatusProps,
  getDependencyStatus
git } from '../../../consumer/component-ops/dependency-status';
import { loadConsumer, Consumer } from '../../../consumer';

export default (async function dependencyStatus(
  dependencyStatusProps: DependencyStatusProps
): Promise<DependencyStatusResult> {
  const consumer: Consumer = await loadConsumer();
  return getDependencyStatus(consumer, dependencyStatusProps);
});
