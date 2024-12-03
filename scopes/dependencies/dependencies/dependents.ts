import { ComponentID } from '@teambit/component-id';
import { BitError } from '@teambit/bit-error';
import { loadConsumerIfExist, Consumer } from '@teambit/legacy/dist/consumer';
import ConsumerNotFound from '@teambit/legacy/dist/consumer/exceptions/consumer-not-found';
import { DependencyGraph, DependenciesInfo } from '@teambit/legacy.dependency-graph';

export type DependentsResults = {
  scopeDependents: DependenciesInfo[];
  workspaceDependents: DependenciesInfo[];
  id: ComponentID;
};

export async function dependents(id: string): Promise<DependentsResults> {
  const consumer = await loadConsumerIfExist();
  if (!consumer) throw new ConsumerNotFound(); // @todo: supports this on bare-scope.
  throwForNewComponent(id, consumer);
  const bitId = consumer.getParsedIdIfExist(id) || ComponentID.fromString(id);
  const scopeDependencyGraph = await DependencyGraph.loadLatest(consumer.scope);
  const scopeDependents = scopeDependencyGraph.getDependentsInfo(bitId);
  const workspaceGraph = await DependencyGraph.buildGraphFromWorkspace(consumer, true);
  const workspaceDependencyGraph = new DependencyGraph(workspaceGraph);
  const workspaceDependents = workspaceDependencyGraph.getDependentsInfo(bitId);
  return { scopeDependents, workspaceDependents, id: bitId };
}

function throwForNewComponent(id: string, consumer: Consumer) {
  const bitId = consumer.bitMap.getExistingBitId(id, false);
  if (!bitId) return;
  if (!bitId._legacy.hasScope()) {
    throw new BitError(`${id} is a new component, there is no data about it in the scope`);
  }
}
