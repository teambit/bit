import R from 'ramda';
import graphlib, { Graph } from 'graphlib';
import pMapSeries from 'p-map-series';
import { Scope } from '..';
import { DependencyNotFound } from '../exceptions';
import { BitId, BitIds } from '../../bit-id';
import { flattenDependencyIds } from '../flatten-dependencies';
import ScopeComponentsImporter from './scope-components-importer';
import { AllDependenciesGraphs } from '../graph/components-graph';
import GeneralError from '../../error/general-error';
import { BitIdStr } from '../../bit-id/bit-id';

// eslint-disable-next-line
export async function getAllFlattenedDependencies(
  scope: Scope,
  componentId: BitId,
  allDependenciesGraphs: AllDependenciesGraphs,
  cache: Record<string, any>,
  notFoundDependencies: BitIds
): Promise<{
  flattenedDependencies: BitIds;
  flattenedDevDependencies: BitIds;
}> {
  const { graphDeps, graphDevDeps, graphExtensionDeps } = allDependenciesGraphs;
  const params = {
    scope,
    componentId,
    cache,
    notFoundDependencies,
  };
  const flattenedDependencies = await getFlattenedDependencies({
    ...params,
    graph: graphDeps,
  });
  const flattenedDevDependencies = await getFlattenedDependencies({
    ...params,
    graph: graphDevDeps,
    prodGraph: graphDeps,
  });
  const flattenedExtensionDependencies = await getFlattenedDependencies({
    ...params,
    graph: graphExtensionDeps,
    prodGraph: graphDeps,
  });

  const getFlattenedDevDeps = () => {
    // remove extensions dependencies that are also regular dependencies
    // (no need to do the same for devDependencies, because their duplicated are removed previously)
    const flattenedExt = flattenedExtensionDependencies.removeMultipleIfExistWithoutVersion(flattenedDependencies);
    return BitIds.uniqFromArray([...flattenedDevDependencies, ...flattenedExt]);
  };

  return {
    flattenedDependencies,
    flattenedDevDependencies: getFlattenedDevDeps(),
  };
}

async function getFlattenedDependencies({
  scope,
  componentId,
  graph,
  cache,
  notFoundDependencies,
  prodGraph,
}: {
  scope: Scope;
  componentId: BitId;
  graph: Graph;
  cache: Record<string, any>;
  notFoundDependencies: BitIds;
  prodGraph?: Graph;
}): Promise<BitIds> {
  const id = componentId.toString();
  const edges = getEdges(graph, id);
  if (!edges) return new BitIds();
  const dependencies = getEdgesWithProdGraph(prodGraph, edges);
  if (!dependencies.length) return new BitIds();
  const flattenDependency = async (dependency) => {
    if (cache[dependency]) return cache[dependency];
    // @ts-ignore if graph doesn't have the node, prodGraph must have it
    const dependencyBitId: BitId = graph.node(dependency) || prodGraph.node(dependency);
    let versionDependencies;
    if (notFoundDependencies.has(dependencyBitId)) return [dependencyBitId];
    const scopeComponentsImporter = ScopeComponentsImporter.getInstance(scope);
    try {
      versionDependencies = await scopeComponentsImporter.importDependencies(BitIds.fromArray([dependencyBitId]));
    } catch (err) {
      if (err instanceof DependencyNotFound) {
        notFoundDependencies.push(dependencyBitId);
        throwWhenDepNotIncluded(componentId, dependencyBitId);
        return [dependencyBitId];
      }
      throw err;
    }
    const flattenedDependencies = await flattenDependencyIds(versionDependencies, scope.objects);
    // Store the flatten dependencies in cache
    cache[dependency] = flattenedDependencies;
    return flattenedDependencies;
  };
  const flattened = await pMapSeries(dependencies, flattenDependency);
  const flattenedUnique = BitIds.uniqFromArray(R.flatten(flattened));
  // when a component has cycle dependencies, the flattenedDependencies contains the component itself. remove it.
  return flattenedUnique.removeIfExistWithoutVersion(componentId);
}

function throwWhenDepNotIncluded(componentId: BitId, dependencyId: BitId) {
  if (!dependencyId.hasScope() && !dependencyId.hasVersion()) {
    throw new GeneralError(`fatal: "${componentId.toString()}" has a dependency "${dependencyId.toString()}".
this dependency was not included in the tag command.`);
  }
}

function getEdges(graph: Graph, id: BitIdStr): BitIdStr[] | null {
  if (!graph.hasNode(id)) return null;
  // @ts-ignore
  const edges = graphlib.alg.preorder(graph, id);
  return R.tail(edges); // the first item is the component itself
}

/**
 * for non-prod files, such as test files, we're interested also with its prod dependency.
 * for example, a test file foo.spec.js of component 'foo', requires bar.js from component
 * 'bar'. 'bar.js' requires 'baz.js' from component 'baz'.
 * when calculating the edges of foo.spec.js by devGraph only, we'll get bar.js but not
 * baz.js because the relationship between bar and baz are set on prodGraph only.
 * @see dev-dependencies.e2e, 'dev-dependency that requires prod-dependency' case.
 */
function getEdgesWithProdGraph(prodGraph: Graph | null | undefined, dependencies: BitIdStr[]): BitIdStr[] {
  if (!prodGraph) return dependencies;
  const prodDependencies = R.flatten(dependencies.map((dependency) => getEdges(prodGraph, dependency))).filter(
    (x) => x
  );
  return R.uniq([...dependencies, ...prodDependencies]);
}
