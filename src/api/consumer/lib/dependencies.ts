import { loadConsumerIfExist } from '../../../consumer';
import {
  DependencyResolver,
  updateDependenciesVersions,
} from '../../../consumer/component/dependencies/dependency-resolver';
import type { DebugDependencies } from '../../../consumer/component/dependencies/dependency-resolver/dependencies-resolver';
import type { OverridesDependenciesData } from '../../../consumer/component/dependencies/dependency-resolver/dependencies-data';
import ConsumerNotFound from '../../../consumer/exceptions/consumer-not-found';

export type DependenciesResults = DebugDependencies & OverridesDependenciesData & { coreAspects: string[] };

export async function dependencies(id: string): Promise<DependenciesResults> {
  const consumer = await loadConsumerIfExist();
  if (!consumer) throw new ConsumerNotFound(); // @todo: supports this on bare-scope.
  const bitId = consumer.getParsedId(id);
  const component = await consumer.loadComponent(bitId);
  const dependencyResolver = new DependencyResolver(component, consumer);
  const dependenciesData = await dependencyResolver.getDependenciesData({}, undefined);
  const debugData: DebugDependencies = dependencyResolver.debugDependenciesData;
  updateDependenciesVersions(consumer, component, debugData.components);
  return { ...debugData, ...dependenciesData.overridesDependencies, coreAspects: dependenciesData.coreAspects };
}
