import graphlib, { Graph } from 'graphlib';
import mapSeries from 'p-map-series';
import R from 'ramda';

import { Scope } from '..';
import { BitId, BitIds } from '../../bit-id';
import { BitIdStr } from '../../bit-id/bit-id';
import Component from '../../consumer/component/consumer-component';
import GeneralError from '../../error/general-error';
import { DependencyNotFound } from '../exceptions';
import { flattenDependencyIds } from '../flatten-dependencies';
import { AllDependenciesGraphs, buildComponentsGraph } from '../graph/components-graph';
import ScopeComponentsImporter from './scope-components-importer';

export class FlattenedDependenciesGetter {
  private allDependenciesGraphs: AllDependenciesGraphs;
  private cache: Record<string, any> = {};
  private notFoundDependencies = new BitIds();
  constructor(private scope: Scope, private components: Component[]) {}
  async populateFlattenedDependencies() {
    this.allDependenciesGraphs = buildComponentsGraph(this.components);
    await this.importExternalDependenciesInBulk();
    await Promise.all(
      this.components.map(async (component) => {
        const { flattenedDependencies, flattenedDevDependencies } = await this.getAllFlattenedDependencies(
          component.id
        );
        component.flattenedDependencies = flattenedDependencies;
        component.flattenedDevDependencies = flattenedDevDependencies;
      })
    );
  }
  private async importExternalDependenciesInBulk() {
    const allGraphs = Object.values(this.allDependenciesGraphs);
    const allDependencies = this.components.map((component) => {
      return allGraphs.map((graph) => getEdges(graph, component.id.toString()));
    });
    const idsStr: string[] = R.uniq(R.flatten(allDependencies));
    const bitIds = idsStr
      .filter((id) => id)
      .map((idStr) => {
        const graphWithId = allGraphs.find((g) => g.node(idStr));
        return graphWithId?.node(idStr);
      })
      .filter((bitId: BitId) => bitId && bitId.hasScope())
      .filter((bitId) => !this.components.find((c) => c.id.isEqual(bitId)));
    const scopeComponentsImporter = ScopeComponentsImporter.getInstance(this.scope);
    await scopeComponentsImporter.importMany(BitIds.fromArray(bitIds));
  }
  private async getAllFlattenedDependencies(
    componentId: BitId
  ): Promise<{
    flattenedDependencies: BitIds;
    flattenedDevDependencies: BitIds;
  }> {
    const { graphDeps, graphDevDeps, graphExtensionDeps } = this.allDependenciesGraphs;

    const flattenedDependencies = await this.getFlattenedDependencies({
      componentId,
      graph: graphDeps,
    });
    const flattenedDevDependencies = await this.getFlattenedDependencies({
      componentId,
      graph: graphDevDeps,
      prodGraph: graphDeps,
    });
    const flattenedExtensionDependencies = await this.getFlattenedDependencies({
      componentId,
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

  private async getFlattenedDependencies({
    componentId,
    graph,
    prodGraph,
  }: {
    componentId: BitId;
    graph: Graph;
    prodGraph?: Graph;
  }): Promise<BitIds> {
    const id = componentId.toString();
    const deps = getEdges(graph, id);
    const prodDeps = prodGraph ? getEdges(prodGraph, id) : null;
    if (!deps && !prodDeps) return new BitIds();
    const dependencies = getEdgesWithProdGraph(prodGraph, deps || [], graph, prodDeps || []);
    if (!dependencies.length) return new BitIds();
    const flattenDependency = async (dependency) => {
      if (this.cache[dependency]) return this.cache[dependency];
      // @ts-ignore if graph doesn't have the node, prodGraph must have it
      const dependencyBitId: BitId = graph.node(dependency) || prodGraph.node(dependency);
      let versionDependencies;
      if (this.notFoundDependencies.has(dependencyBitId)) return [dependencyBitId];
      const scopeComponentsImporter = ScopeComponentsImporter.getInstance(this.scope);
      try {
        versionDependencies = await scopeComponentsImporter.importDependencies(BitIds.fromArray([dependencyBitId]));
      } catch (err) {
        if (err instanceof DependencyNotFound) {
          this.notFoundDependencies.push(dependencyBitId);
          throwWhenDepNotIncluded(componentId, dependencyBitId);
          return [dependencyBitId];
        }
        throw err;
      }
      const flattenedDependencies = await flattenDependencyIds(versionDependencies, this.scope.objects);
      // Store the flatten dependencies in cache
      this.cache[dependency] = flattenedDependencies;
      return flattenedDependencies;
    };
    const flattened = await mapSeries(dependencies, flattenDependency);
    const flattenedUnique = BitIds.uniqFromArray(R.flatten(flattened));
    // when a component has cycle dependencies, the flattenedDependencies contains the component itself. remove it.
    return flattenedUnique.removeIfExistWithoutVersion(componentId);
  }
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
 * ** dev-dep that requires prod-dep indirectly **
 * for non-prod files, such as test files, we're interested also with its prod dependency.
 * for example, a test file foo.spec.js of component 'foo', requires bar.js from component
 * 'bar'. 'bar.js' requires 'baz.js' from component 'baz'.
 * when calculating the edges of foo.spec.js by devGraph only, we'll get bar.js but not
 * baz.js because the relationship between bar and baz are set on prodGraph only.
 * this part is fetched by `prodDependencies` var.
 * @see dev-dependencies.e2e, 'dev-dependency that requires prod-dependency' case.
 *
 * ** dev-dep that requires prod-dep indirectly **
 * imagine that foo requires bar that has baz as a devDependency. investigating only the devGraph
 * misses this relationship between bar and baz. so we need to fetch also the prod edges and then
 * check their devDependencies.
 * this part is done by `devDependencies` var.
 */
function getEdgesWithProdGraph(
  prodGraph: Graph | null | undefined,
  nonProdDeps: BitIdStr[],
  graph: Graph,
  prodDeps: BitIdStr[]
): BitIdStr[] {
  if (!prodGraph) return nonProdDeps;
  const prodDependencies = R.flatten(nonProdDeps.map((dependency) => getEdges(prodGraph, dependency))).filter((x) => x);
  const devDependencies = R.flatten(prodDeps.map((dependency) => getEdges(graph, dependency))).filter((x) => x);

  return R.uniq([...nonProdDeps, ...prodDependencies, ...devDependencies]);
}
