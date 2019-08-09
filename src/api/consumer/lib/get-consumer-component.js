/** @flow */
import { loadConsumer, Consumer } from '../../../consumer';
import NothingToCompareTo from './exceptions/nothing-to-compare-to';
import DependencyGraph from '../../../scope/graph/scope-graph';
import type { DependenciesInfo } from '../../../scope/graph/scope-graph';
import ComponentsList from '../../../consumer/component/components-list';

export default (async function getConsumerBit({
  id,
  compare,
  allVersions,
  showRemoteVersions,
  showDependents,
  showDependencies
}: {
  id: string,
  compare: boolean,
  allVersions: ?boolean,
  showRemoteVersions: boolean,
  showDependents: boolean,
  showDependencies: boolean
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
    const componentsList = new ComponentsList(consumer);
    const allComponents = await componentsList.getFromFileSystem();
    const graph = DependencyGraph.buildGraphFromComponents(allComponents);
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
