/** @flow */
import {getDependencyStatus } from '../../../consumer/component-ops/dependency-status';
import { DependencyStatusResult } from '../../../consumer/component-ops/dependency-status';
import DependencyStatusProps from '../../../consumer/component-ops/dependency-status';
import { loadConsumer, Consumer } from '../../../consumer';


export default (async function dependencyStatus(dependencyStatusProps: DependencyStatusProps): Promise<DependencyStatusResult> {  
  const consumer: Consumer = await loadConsumer(); 
  return await getDependencyStatus(consumer, dependencyStatusProps);
});