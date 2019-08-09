/** @flow */
import { Scope, loadScope } from '../../../scope';
import { BitId } from '../../../bit-id';
import DependencyGraph from '../../../scope/graph/scope-graph';

export default (async function graph(path: string, id: ?string): Promise<string> {
  const scope: Scope = await loadScope(path);
  const dependencyGraph = await DependencyGraph.loadLatest(scope);
  if (!id) {
    return dependencyGraph.serialize();
  }
  const bitId: BitId = await scope.getParsedId(id);
  const componentGraph = dependencyGraph.getSubGraphOfConnectedComponents(bitId);
  return dependencyGraph.serialize(componentGraph);
});
