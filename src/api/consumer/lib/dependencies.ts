import { BitId } from '@teambit/legacy-bit-id';
import { loadConsumerIfExist } from '../../../consumer';
import {
  DependencyResolver,
  updateDependenciesVersions,
} from '../../../consumer/component/dependencies/dependency-resolver';
import type { DebugDependencies } from '../../../consumer/component/dependencies/dependency-resolver/dependencies-resolver';
import type { OverridesDependenciesData } from '../../../consumer/component/dependencies/dependency-resolver/dependencies-data';
import ConsumerNotFound from '../../../consumer/exceptions/consumer-not-found';
import DependencyGraph, { DependenciesInfo } from '../../../scope/graph/scope-graph';

export type DependenciesResultsDebug = DebugDependencies & OverridesDependenciesData & { coreAspects: string[] };

export type DependenciesResults = {
  scopeDependencies: DependenciesInfo[];
  workspaceDependencies: DependenciesInfo[];
  id: BitId;
};

export async function dependencies(
  id: string,
  debug: boolean
): Promise<DependenciesResultsDebug | DependenciesResults> {
  const consumer = await loadConsumerIfExist();
  if (!consumer) throw new ConsumerNotFound(); // @todo: supports this on bare-scope.
  const bitId = consumer.getParsedId(id);
  if (debug) {
    const component = await consumer.loadComponent(bitId);
    const dependencyResolver = new DependencyResolver(component, consumer);
    const dependenciesData = await dependencyResolver.getDependenciesData({}, undefined);
    const debugData: DebugDependencies = dependencyResolver.debugDependenciesData;
    updateDependenciesVersions(consumer, component, debugData.components);
    return { ...debugData, ...dependenciesData.overridesDependencies, coreAspects: dependenciesData.coreAspects };
  }
  const scopeGraph = await DependencyGraph.buildGraphFromScope(consumer.scope);
  const scopeDependencyGraph = new DependencyGraph(scopeGraph);
  const scopeDependencies = scopeDependencyGraph.getDependenciesInfo(bitId);
  const workspaceGraph = await DependencyGraph.buildGraphFromWorkspace(consumer, true);
  const workspaceDependencyGraph = new DependencyGraph(workspaceGraph);
  const workspaceDependencies = workspaceDependencyGraph.getDependenciesInfo(bitId);
  return { scopeDependencies, workspaceDependencies, id: bitId };
}
