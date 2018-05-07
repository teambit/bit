/** @flow */
import type { getDependencyStatus } from '../../../consumer/component-ops/dependency-status';
import type { DependencyStatusResult } from '../../../consumer/component-ops/dependency-status';
import type { DependencyStatusProps }  from '../../../consumer/component-ops/dependency-status';
import { loadConsumer, Consumer } from '../../../consumer';


export default (async function dependencyStatus(dependencyStatusProps: DependencyStatusProps): Promise<DependencyStatusResult> {  
  const consumer: Consumer = await loadConsumer(); 
  return await getDependencyStatus(consumer, dependencyStatusProps);
});
