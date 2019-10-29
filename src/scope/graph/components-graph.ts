import graphLib from 'graphlib';
import R from 'ramda';
import Component from '../../consumer/component/consumer-component';
import Dependencies from '../../consumer/component/dependencies/dependencies';
import ComponentWithDependencies from '../component-dependencies';
import GeneralError from '../../error/general-error';
import { ComponentsAndVersions } from '../scope';
import { BitId } from '../../bit-id';

const Graph = graphLib.Graph;

export function buildComponentsGraph(components: Component[]) {
  const setGraphEdges = (component: Component, dependencies: Dependencies, graph) => {
    const id = component.id.toString();
    dependencies.get().forEach(dependency => {
      const depId = dependency.id.toString();
      // save the full BitId of a string id to be able to retrieve it later with no confusion
      if (!graph.hasNode(id)) graph.setNode(id, component.id);
      if (!graph.hasNode(depId)) graph.setNode(depId, dependency.id);
      graph.setEdge(id, depId);
    });
  };

  const graphDeps = new Graph();
  const graphDevDeps = new Graph();
  const graphCompilerDeps = new Graph();
  const graphTesterDeps = new Graph();
  components.forEach(component => {
    setGraphEdges(component, component.dependencies, graphDeps);
    setGraphEdges(component, component.devDependencies, graphDevDeps);
    setGraphEdges(component, component.compilerDependencies, graphCompilerDeps);
    setGraphEdges(component, component.testerDependencies, graphTesterDeps);
  });
  return { graphDeps, graphDevDeps, graphCompilerDeps, graphTesterDeps };
}

export function buildComponentsGraphForComponentsAndVersion(components: ComponentsAndVersions[]) {
  const setGraphEdges = (bitId: BitId, dependencies: Dependencies, graph) => {
    const id = bitId.toString();
    dependencies.get().forEach(dependency => {
      const depId = dependency.id.toString();
      // save the full BitId of a string id to be able to retrieve it later with no confusion
      if (!graph.hasNode(id)) graph.setNode(id, bitId);
      if (!graph.hasNode(depId)) graph.setNode(depId, dependency.id);
      graph.setEdge(id, depId);
    });
  };

  const graphDeps = new Graph();
  const graphDevDeps = new Graph();
  const graphCompilerDeps = new Graph();
  const graphTesterDeps = new Graph();
  components.forEach(({ component, version, versionStr }) => {
    const bitId = component.toBitId().changeVersion(versionStr);
    setGraphEdges(bitId, version.dependencies, graphDeps);
    setGraphEdges(bitId, version.devDependencies, graphDevDeps);
    setGraphEdges(bitId, version.compilerDependencies, graphCompilerDeps);
    setGraphEdges(bitId, version.testerDependencies, graphTesterDeps);
  });
  return { graphDeps, graphDevDeps, graphCompilerDeps, graphTesterDeps };
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
