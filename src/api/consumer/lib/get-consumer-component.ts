import { Consumer, loadConsumer } from '../../../consumer';
import DependencyGraph, { DependenciesInfo } from '../../../scope/graph/scope-graph';
import NothingToCompareTo from './exceptions/nothing-to-compare-to';

export default (async function getConsumerBit({
  id,
  compare,
  allVersions,
  showRemoteVersions,
  showDependents,
  showDependencies,
}: {
  id: string;
  compare: boolean;
  allVersions: boolean | null | undefined;
  showRemoteVersions: boolean;
  showDependents: boolean;
  showDependencies: boolean;
}) {
  const consumer: Consumer = await loadConsumer();
  const bitId = consumer.getParsedId(id);
  if (allVersions) {
    return consumer.loadAllVersionsOfComponentFromModel(bitId);
  }
  const component = await consumer.loadComponent(bitId); // loads recent component
  let dependenciesInfo: DependenciesInfo[] = [];
  let dependentsInfo: DependenciesInfo[] = [];
  if (showDependents || showDependencies) {
    const graph = await DependencyGraph.buildGraphFromWorkspace(consumer);
    const dependencyGraph = new DependencyGraph(graph);
    const componentGraph = dependencyGraph.getSubGraphOfConnectedComponents(component.id);
    const componentDepGraph = new DependencyGraph(componentGraph);
    if (showDependents) {
      dependentsInfo = componentDepGraph.getDependentsInfo(component.id);
    }
    if (showDependencies) {
      dependenciesInfo = componentDepGraph.getDependenciesInfo(component.id);
    }
  }
  if (showRemoteVersions) {
    await consumer.addRemoteAndLocalVersionsToDependencies(component, true);
  }
  if (compare) {
    if (!component.componentFromModel) throw new NothingToCompareTo(id);
    return { component, componentModel: component.componentFromModel };
  }
  await consumer.onDestroy();
  return { component, dependentsInfo, dependenciesInfo };
});
