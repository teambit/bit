import { Graph } from 'graphviz';
import DependencyGraph from '../../../scope/graph/scope-graph';
import VisualDependencyGraph from '../../../scope/graph/vizgraph';
import { Consumer, loadConsumerIfExist } from '../../../consumer';
import { Remote, Remotes } from '../../../remotes';
import { BitId } from '../../../bit-id';
import { getScopeRemotes } from '../../../scope/scope-remotes';
import ConsumerNotFound from '../../../consumer/exceptions/consumer-not-found';

export default (async function paintGraph(id: string, options: Object): Promise<string> {
  const { image, remote, layout, allVersions } = options;
  const consumer: Consumer | null | undefined = await loadConsumerIfExist();
  if (!consumer && !remote) throw new ConsumerNotFound();
  const getBitId = (): BitId | null | undefined => {
    if (!id) return null;
    if (remote) return BitId.parse(id, true); // user used --remote so we know it has a scope
    return consumer.getParsedId(id);
  };
  const bitId = getBitId();
  const graph = await getGraph();
  const config = {};
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
        const scopeName: string = typeof remote === 'string' ? remote : bitId.scope;
        const remoteScope = await getRemote(scopeName);
        const componentDepGraph = await remoteScope.graph(bitId);
        return componentDepGraph.graph;
      }
      if (typeof remote !== 'string') {
        throw new Error('please specify remote scope name or enter an id');
      }
      const remoteScope = await getRemote(remote);
      const componentDepGraph = await remoteScope.graph();
      return componentDepGraph.graph;
    }

    const onlyLatest = !allVersions;
    // $FlowFixMe consumer must be set here
    const workspaceGraph = await DependencyGraph.buildGraphFromWorkspace(consumer, onlyLatest);
    const dependencyGraph = new DependencyGraph(workspaceGraph);
    if (id) {
      const componentGraph = dependencyGraph.getSubGraphOfConnectedComponents(bitId);
      const componentDepGraph = new DependencyGraph(componentGraph);
      return componentDepGraph.graph;
    }
    return dependencyGraph.graph;
  }
  async function getRemote(scopeName: string): Promise<Remote> {
    if (consumer) {
      const remotes: Remotes = await getScopeRemotes(consumer.scope);
      return remotes.resolve(scopeName, consumer.scope);
    }
    return Remotes.getScopeRemote(scopeName);
  }
});
