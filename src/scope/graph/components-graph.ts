import graphLib, { Graph } from 'graphlib';
import R from 'ramda';
import Component from '../../consumer/component/consumer-component';
import Dependencies, { DEPENDENCIES_TYPES } from '../../consumer/component/dependencies/dependencies';
import loadFlattenedDependenciesForCapsule from '../../consumer/component-ops/load-flattened-dependencies';
import ComponentWithDependencies from '../component-dependencies';
import GeneralError from '../../error/general-error';
import { ComponentsAndVersions } from '../scope';
import { BitId, BitIds } from '../../bit-id';
import { Consumer } from '../../consumer';
import { Dependency } from '../../consumer/component/dependencies';

export type AllDependenciesGraphs = {
  graphDeps: Graph;
  graphDevDeps: Graph;
  graphCompilerDeps: Graph;
  graphTesterDeps: Graph;
};

export function buildComponentsGraph(components: Component[]): AllDependenciesGraphs {
  const graphDeps = new Graph();
  const graphDevDeps = new Graph();
  const graphCompilerDeps = new Graph();
  const graphTesterDeps = new Graph();
  components.forEach(component => {
    _setGraphEdges(component.id, component.dependencies, graphDeps);
    _setGraphEdges(component.id, component.devDependencies, graphDevDeps);
    _setGraphEdges(component.id, component.compilerDependencies, graphCompilerDeps);
    _setGraphEdges(component.id, component.testerDependencies, graphTesterDeps);
  });
  return { graphDeps, graphDevDeps, graphCompilerDeps, graphTesterDeps };
}

export function buildComponentsGraphForComponentsAndVersion(
  components: ComponentsAndVersions[]
): AllDependenciesGraphs {
  const graphDeps = new Graph();
  const graphDevDeps = new Graph();
  const graphCompilerDeps = new Graph();
  const graphTesterDeps = new Graph();
  components.forEach(({ component, version, versionStr }) => {
    const bitId = component.toBitId().changeVersion(versionStr);
    _setGraphEdges(bitId, version.dependencies, graphDeps);
    _setGraphEdges(bitId, version.devDependencies, graphDevDeps);
    _setGraphEdges(bitId, version.compilerDependencies, graphCompilerDeps);
    _setGraphEdges(bitId, version.testerDependencies, graphTesterDeps);
  });
  return { graphDeps, graphDevDeps, graphCompilerDeps, graphTesterDeps };
}

export function buildOneGraphForComponentsAndMultipleVersions(components: ComponentsAndVersions[]): Graph {
  const graph = new Graph();
  components.forEach(({ component, version }) => {
    const bitId = component.toBitId().changeVersion(null);
    const idStr = bitId.toString();
    if (!graph.hasNode(idStr)) graph.setNode(idStr, bitId);
    version.getAllDependencies().forEach(dependency => {
      const depId = dependency.id.changeVersion(null);
      const depIdStr = depId.toString();
      if (!graph.hasNode(depIdStr)) graph.setNode(depIdStr, depId);
      graph.setEdge(idStr, depIdStr);
    });
  });
  return graph;
}

/**
 * returns one graph that includes all dependencies types. each edge has a label of the dependency
 * type. the nodes content is the Component object.
 */
export async function buildOneGraphForComponents(ids: BitId[], consumer: Consumer): Promise<Graph> {
  const graph = new Graph();
  const { components } = await consumer.loadComponents(BitIds.fromArray(ids));
  const componentsWithDeps = await Promise.all(
    components.map(component => loadFlattenedDependenciesForCapsule(consumer, component))
  );
  const allComponents: Component[] = R.flatten(componentsWithDeps.map(c => [c.component, ...c.allDependencies]));

  // set vertices
  allComponents.forEach(component => {
    const idStr = component.id.toStringWithoutVersion();
    if (!graph.hasNode(idStr)) graph.setNode(idStr, component);
  });

  // set edges
  allComponents.forEach((component: Component) => {
    DEPENDENCIES_TYPES.forEach(depType => {
      component[depType].get().forEach((dependency: Dependency) => {
        const depIdStr = dependency.id.toStringWithoutVersion();
        graph.setEdge(depIdStr, component.id.toStringWithoutVersion(), depType);
      });
    });
  });

  // uncomment to print the graph content
  // console.log('graph', graphLib.json.write(graph))

  return graph;
}

function _setGraphEdges(bitId: BitId, dependencies: Dependencies, graph: Graph) {
  const id = bitId.toString();
  dependencies.get().forEach(dependency => {
    const depId = dependency.id.toString();
    // save the full BitId of a string id to be able to retrieve it later with no confusion
    if (!graph.hasNode(id)) graph.setNode(id, bitId);
    if (!graph.hasNode(depId)) graph.setNode(depId, dependency.id);
    graph.setEdge(id, depId);
  });
}

/**
 * throw for cyclic dependencies
 * it sorts only "dependencies", not "devDependencies" (nor compiler/tester dependencies).
 */
export function topologicalSortComponentDependencies(componentWithDependencies: ComponentWithDependencies): void {
  const { graphDeps } = buildComponentsGraph([
    componentWithDependencies.component,
    ...componentWithDependencies.allDependencies
  ]);
  const componentId = componentWithDependencies.component.id.toString();
  let sortedComponents;
  if (!graphLib.alg.isAcyclic(graphDeps)) {
    const circle = graphLib.alg.findCycles(graphDeps);
    throw new GeneralError(
      `unable to topological sort dependencies of ${componentId}, it has the following cyclic dependencies\n${circle}`
    );
  }
  try {
    sortedComponents = graphLib.alg.topsort(graphDeps);
    const sortedComponentsIds = sortedComponents.map(s => graphDeps.node(s));
    const sortedDependenciesIds = R.tail(sortedComponentsIds); // the first one is the component itself
    const dependencies = sortedDependenciesIds.map(depId => {
      const matchDependency = componentWithDependencies.dependencies.find(dependency => dependency.id.isEqual(depId));
      if (!matchDependency) throw new Error(`topologicalSortComponentDependencies, ${depId.toString()} is missing`);
      return matchDependency;
    });
    componentWithDependencies.dependencies = dependencies;
  } catch (err) {
    throw new GeneralError(`unable to topological sort dependencies of ${componentId}. Original error: ${err.message}`);
  }
}
