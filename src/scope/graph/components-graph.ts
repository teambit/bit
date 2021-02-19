import graphLib, { Graph as GraphLib } from 'graphlib';
import R from 'ramda';

import { Scope } from '..';
import { BitId, BitIds } from '../../bit-id';
import { Consumer } from '../../consumer';
import Component from '../../consumer/component/consumer-component';
import Dependencies from '../../consumer/component/dependencies/dependencies';
import GeneralError from '../../error/general-error';
import ComponentWithDependencies from '../component-dependencies';
import { ComponentsAndVersions } from '../scope';
import Graph from './graph';
import { GraphFromFsBuilder } from './build-graph-from-fs';
import ScopeComponentsImporter from '../component-ops/scope-components-importer';

export type AllDependenciesGraphs = {
  graphDeps: GraphLib;
  graphDevDeps: GraphLib;
  graphExtensionDeps: GraphLib;
};

export function buildComponentsGraph(components: Component[]): AllDependenciesGraphs {
  const graphDeps = new GraphLib();
  const graphDevDeps = new GraphLib();
  const graphExtensionDeps = new GraphLib();
  components.forEach((component) => {
    _setGraphEdges(component.id, component.dependencies, graphDeps);
    _setGraphEdges(component.id, component.devDependencies, graphDevDeps);
    _setGraphEdges(component.id, component.extensionDependencies, graphExtensionDeps);
  });
  return { graphDeps, graphDevDeps, graphExtensionDeps };
}

/**
 * one graph of the given components. it doesn't fetch/load anything. it builds the graph with the
 * given data. the node is a BitId and the edge has the label of the dependency type. it can be
 * either "dependencies" or "devDependencies".
 */
export function buildComponentsGraphCombined(components: Component[]): Graph {
  const graph = new Graph();
  components.forEach((component) => {
    _setGraphEdges(component.id, component.dependencies, graph);
    _setGraphEdges(component.id, component.devDependencies, graph, 'devDependencies');
    _setGraphEdges(component.id, component.extensionDependencies, graph, 'devDependencies');
  });
  return graph;
}

export function buildComponentsGraphForComponentsAndVersion(
  components: ComponentsAndVersions[]
): AllDependenciesGraphs {
  const graphDeps = new GraphLib();
  const graphDevDeps = new GraphLib();
  const graphExtensionDeps = new GraphLib();
  components.forEach(({ component, version, versionStr }) => {
    const bitId = component.toBitId().changeVersion(versionStr);
    _setGraphEdges(bitId, version.dependencies, graphDeps);
    _setGraphEdges(bitId, version.devDependencies, graphDevDeps);
    _setGraphEdges(bitId, version.extensionDependencies, graphExtensionDeps);
  });
  return { graphDeps, graphDevDeps, graphExtensionDeps };
}

export function buildOneGraphForComponentsAndMultipleVersions(components: ComponentsAndVersions[]): Graph {
  const graph = new Graph();
  components.forEach(({ component, version }) => {
    const bitId = component.toBitId().changeVersion(undefined);
    const idStr = bitId.toString();
    if (!graph.hasNode(idStr)) graph.setNode(idStr, bitId);
    version.getAllDependencies().forEach((dependency) => {
      const depId = dependency.id.changeVersion(undefined);
      const depIdStr = depId.toString();
      if (!graph.hasNode(depIdStr)) graph.setNode(depIdStr, depId);
      graph.setEdge(idStr, depIdStr);
    });
  });
  return graph;
}

/**
 * Note - this gets called from Harmony only.
 * returns one graph that includes all dependencies types. each edge has a label of the dependency
 * type. the nodes content is the Component object.
 */
export async function buildOneGraphForComponents(
  ids: BitId[],
  consumer: Consumer,
  loadComponentsFunc?: (bitIds: BitId[]) => Promise<Component[]>,
  ignoreIds?: BitIds
): Promise<Graph> {
  const graphFromFsBuilder = new GraphFromFsBuilder(consumer, ignoreIds, loadComponentsFunc);
  return graphFromFsBuilder.buildGraph(ids);
}

/**
 * returns one graph that includes all dependencies types. each edge has a label of the dependency
 * type. the nodes content is the Component object.
 */
export async function buildOneGraphForComponentsUsingScope(
  ids: BitId[],
  scope: Scope,
  direction: 'normal' | 'reverse' = 'normal'
): Promise<Graph> {
  const components = await scope.getManyConsumerComponents(ids);
  const allFlattened = components.map((component) => component.getAllFlattenedDependencies()).flat();
  const scopeComponentImporter = new ScopeComponentsImporter(scope);
  await scopeComponentImporter.importMany(BitIds.uniqFromArray(allFlattened));
  const dependencies = await scope.getManyConsumerComponents(allFlattened);
  const allComponents: Component[] = [...components, ...dependencies];

  return buildGraphFromComponentsObjects(allComponents, direction);
}

export function buildGraphFromComponentsObjects(
  components: Component[],
  direction: 'normal' | 'reverse' = 'normal',
  ignoreIds = new BitIds()
): Graph {
  const graph = new Graph();
  // set vertices
  components.forEach((component) => {
    const idStr = component.id.toString();
    if (!graph.hasNode(idStr)) graph.setNode(idStr, component);
  });

  // set edges
  const setEdge = (compId: BitId, depId: BitId, depType: string) => {
    const depIdStr = depId.toString();
    if (direction === 'normal') {
      graph.setEdge(compId.toString(), depIdStr, depType);
    } else {
      graph.setEdge(depIdStr, compId.toString(), depType);
    }
  };
  components.forEach((component: Component) => {
    Object.entries(component.depsIdsGroupedByType).forEach(([depType, depIds]) => {
      depIds.forEach((depId) => {
        if (ignoreIds.has(depId)) return;
        if (!graph.hasNode(depId.toString())) {
          throw new Error(`buildGraphFromComponentsObjects: missing node of ${depId.toString()}`);
        }
        setEdge(component.id, depId, depType);
      });
    });
  });

  // uncomment to print the graph content
  // console.log('graph', graphLib.json.write(graph))

  return graph;
}

function _setGraphEdges(bitId: BitId, dependencies: Dependencies, graph: GraphLib, label = 'dependencies') {
  const id = bitId.toString();
  dependencies.get().forEach((dependency) => {
    const depId = dependency.id.toString();
    // save the full BitId of a string id to be able to retrieve it later with no confusion
    if (!graph.hasNode(id)) graph.setNode(id, bitId);
    if (!graph.hasNode(depId)) graph.setNode(depId, dependency.id);
    graph.setEdge(id, depId, label);
  });
}

/**
 * throw for cyclic dependencies
 * it sorts only "dependencies", not "devDependencies" (nor compiler/tester dependencies).
 */
export function topologicalSortComponentDependencies(componentWithDependencies: ComponentWithDependencies): void {
  const { graphDeps } = buildComponentsGraph([
    componentWithDependencies.component,
    ...componentWithDependencies.allDependencies,
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
    const sortedComponentsIds = sortedComponents.map((s) => graphDeps.node(s));
    const sortedDependenciesIds = R.tail(sortedComponentsIds); // the first one is the component itself
    const dependencies = sortedDependenciesIds.map((depId) => {
      const matchDependency = componentWithDependencies.dependencies.find((dependency) => dependency.id.isEqual(depId));
      if (!matchDependency) throw new Error(`topologicalSortComponentDependencies, ${depId.toString()} is missing`);
      return matchDependency;
    });
    componentWithDependencies.dependencies = dependencies;
  } catch (err) {
    throw new GeneralError(`unable to topological sort dependencies of ${componentId}. Original error: ${err.message}`);
  }
}
