import graphLib, { Graph as GraphLib } from 'graphlib';
import mapSeries from 'p-map-series';
import R from 'ramda';

import { Scope } from '..';
import { BitId, BitIds } from '../../bit-id';
import { Consumer } from '../../consumer';
import { FlattenedDependencyLoader } from '../../consumer/component-ops/load-flattened-dependencies';
import Component from '../../consumer/component/consumer-component';
import Dependencies from '../../consumer/component/dependencies/dependencies';
import GeneralError from '../../error/general-error';
import ComponentWithDependencies from '../component-dependencies';
import { ComponentsAndVersions } from '../scope';
import Graph from './graph';
import { MissingBitMapComponent } from '../../consumer/bit-map/exceptions';

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
 * returns one graph that includes all dependencies types. each edge has a label of the dependency
 * type. the nodes content is the Component object.
 * note that the graph only includes the dependencies of the gives ids, but not the dependents,
 * regardless the `direction` parameter.
 */
export async function buildOneGraphForComponents(
  ids: BitId[],
  consumer: Consumer,
  direction: 'normal' | 'reverse' = 'normal',
  loadComponentsFunc?: (bitIds: BitId[]) => Promise<Component[]>,
  ignoreIds?: BitIds
): Promise<Graph> {
  const getComponents = async () => {
    if (loadComponentsFunc) {
      return loadComponentsFunc(ids);
    }

    try {
      const { components } = await consumer.loadComponents(BitIds.fromArray(ids));
      return components;
    } catch (err) {
      if (err instanceof MissingBitMapComponent) {
        const componentsP = ids.map((id) => {
          return consumer.loadComponentFromModel(id);
        });

        return Promise.all(componentsP);
      }

      throw err;
    }
  };
  const components = await getComponents();
  const flattenedDependencyLoader = new FlattenedDependencyLoader(consumer, ignoreIds, loadComponentsFunc);
  const componentsWithDeps = await mapSeries(components, (component: Component) =>
    flattenedDependencyLoader.load(component)
  );
  const allComponents: Component[] = R.flatten(componentsWithDeps.map((c) => [c.component, ...c.allDependencies]));

  return buildGraphFromComponentsObjects(allComponents, direction, ignoreIds);
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
  const loadFlattened = async (component: Component): Promise<Component[]> => {
    return scope.getManyConsumerComponents(component.getAllFlattenedDependencies());
  };
  const dependencies = await Promise.all(components.map((component) => loadFlattened(component)));
  const allComponents: Component[] = [...components, ...R.flatten(dependencies)];

  return buildGraphFromComponentsObjects(allComponents, direction);
}

function buildGraphFromComponentsObjects(
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

function _setGraphEdges(bitId: BitId, dependencies: Dependencies, graph: GraphLib) {
  const id = bitId.toString();
  dependencies.get().forEach((dependency) => {
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
