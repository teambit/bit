import { BitId } from '../../../bit-id';
import { loadConsumerIfExist, Consumer } from '../../../consumer';
import ConsumerNotFound from '../../../consumer/exceptions/consumer-not-found';
import GeneralError from '../../../error/general-error';
import DependencyGraph, { DependenciesInfo } from '../../../scope/graph/scope-graph';

export type DependentsResults = {
  scopeDependents: DependenciesInfo[];
  workspaceDependents: DependenciesInfo[];
  id: BitId;
};

export async function dependents(id: string): Promise<DependentsResults> {
  const consumer = await loadConsumerIfExist();
  if (!consumer) throw new ConsumerNotFound(); // @todo: supports this on bare-scope.
  throwForNewComponent(id, consumer);
  const bitId = BitId.parse(id, true);
  const scopeGraph = await DependencyGraph.buildGraphFromScope(consumer.scope);
  const scopeDependencyGraph = new DependencyGraph(scopeGraph);
  const scopeDependents = scopeDependencyGraph.getDependentsInfo(bitId);
  const workspaceGraph = await DependencyGraph.buildGraphFromWorkspace(consumer, true);
  const workspaceDependencyGraph = new DependencyGraph(workspaceGraph);
  const workspaceDependents = workspaceDependencyGraph.getDependentsInfo(bitId);
  return { scopeDependents, workspaceDependents, id: bitId };
}

function throwForNewComponent(id: string, consumer: Consumer) {
  const bitId = consumer.bitMap.getExistingBitId(id, false);
  if (!bitId) return;
  if (!bitId.hasScope()) {
    throw new GeneralError(`${id} is a new component, there is no data about it in the scope`);
  }
}
