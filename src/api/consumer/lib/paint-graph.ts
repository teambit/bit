import { Graph } from 'graphviz';

import { BitId } from '../../../bit-id';
import { loadConsumerIfExist } from '../../../consumer';
import ConsumerNotFound from '../../../consumer/exceptions/consumer-not-found';
import getRemoteByName from '../../../remotes/get-remote-by-name';
import DependencyGraph from '../../../scope/graph/scope-graph';
import VisualDependencyGraph from '../../../scope/graph/vizgraph';

export default (async function paintGraph(id: string, options: Record<string, any>): Promise<string> {
  const { image, remote, layout, allVersions } = options;
  const consumer = await loadConsumerIfExist();
  if (!consumer && !remote) throw new ConsumerNotFound();
  const getBitId = (): BitId | undefined => {
    if (!id) return undefined;
    if (remote) return BitId.parse(id, true); // user used --remote so we know it has a scope
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return consumer.getParsedId(id);
  };
  const bitId = getBitId();
  const graph = await getGraph();
  const config = {};
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if (layout) config.layout = layout;
  const visualDependencyGraph = await VisualDependencyGraph.loadFromGraphlib(graph, config);
  if (bitId) {
    visualDependencyGraph.highlightId(bitId);
  }
  const result = await visualDependencyGraph.image(image);
  return result;

  async function getGraph(): Promise<Graph> {
    if (remote) {
      if (id) {
        // $FlowFixMe scope must be set as it came from a remote
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        const scopeName: string = typeof remote === 'string' ? remote : bitId.scope;
        const remoteScope = await getRemoteByName(scopeName, consumer);
        const componentDepGraph = await remoteScope.graph(bitId);
        return componentDepGraph.graph;
      }
      if (typeof remote !== 'string') {
        throw new Error('please specify remote scope name or enter an id');
      }
      const remoteScope = await getRemoteByName(remote, consumer);
      const componentDepGraph = await remoteScope.graph();
      return componentDepGraph.graph;
    }

    const onlyLatest = !allVersions;
    // $FlowFixMe consumer must be set here
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const workspaceGraph = await DependencyGraph.buildGraphFromWorkspace(consumer, onlyLatest);
    const dependencyGraph = new DependencyGraph(workspaceGraph);
    if (id) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const componentGraph = dependencyGraph.getSubGraphOfConnectedComponents(bitId);
      const componentDepGraph = new DependencyGraph(componentGraph);
      return componentDepGraph.graph;
    }
    return dependencyGraph.graph;
  }
});
