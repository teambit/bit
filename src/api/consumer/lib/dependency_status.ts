import { Consumer, loadConsumer } from '../../../consumer';
import getDependencyStatus, {
  DependencyStatusProps,
  DependencyStatusResult,
} from '../../../consumer/component-ops/dependency-status';

export default (async function dependencyStatus(
  dependencyStatusProps: DependencyStatusProps
): Promise<DependencyStatusResult> {
  const consumer: Consumer = await loadConsumer();
  return getDependencyStatus(consumer, dependencyStatusProps);
});
