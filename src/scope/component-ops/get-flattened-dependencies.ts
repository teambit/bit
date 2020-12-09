import graphlib, { Graph as GraphLib } from 'graphlib';
import { flatten } from 'lodash';
import mapSeries from 'p-map-series';
import R from 'ramda';
import { Scope } from '..';
import { BitId, BitIds } from '../../bit-id';
import { BitIdStr } from '../../bit-id/bit-id';
import Component from '../../consumer/component/consumer-component';
import GeneralError from '../../error/general-error';
import { buildComponentsGraphCombined } from '../graph/components-graph';
import Graph from '../graph/graph';
import VersionDependencies from '../version-dependencies';
import ScopeComponentsImporter from './scope-components-importer';

type Deps = { dependencies: BitIds; devDependencies: BitIds };

export class FlattenedDependenciesGetter {
  private dependenciesGraph: Graph;
  private prodGraph: Graph;
  private versionDependencies: VersionDependencies[];
  private cache: { [idStr: string]: Deps } = {};
  constructor(private scope: Scope, private components: Component[]) {}

  /**
   * to get the flattened dependencies of a component, we iterate over the direct dependencies and
   * figure out what should be the flattened of each one of the dependencies.
   * a dependency can be one of the two scenarios and should be handled accordingly.
   * 1. a dependency can be tagged/snapped along with the current component.
   * 2. a dependency can be a component that was already tagged before.
   * there is no option #3 of a component that exists on the workspace but wasn't tagged and is not
   * part of the current tag. In such case, we throw an error, see throwWhenDepNotIncluded below.
   *
   * the flattened dependencies process handles the two cases above differently.
   * 1. first, it builds a graph with all current components, this way it's easier to get the
   * flattened dependencies by graph algorithm. (without graph, it becomes difficult when there are
   * circular dependencies).
   * 2. for other components, it loads them from the model and gets the flattened from the objects.
   *
   * to determine whether a flattened is dependency or devDependency, we check whether the path
   * from the component to the flattened consists of only prod, then it's "dependency". otherwise,
   * if there is even only one devDependency in the chain, then it's a devDependency.
   */
  async populateFlattenedDependencies() {
    this.createGraphs(this.components);
    await this.importExternalDependenciesInBulk();
    await mapSeries(this.components, async (component) => {
      const { dependencies, devDependencies } = await this.getFlattened(component.id);
      component.flattenedDependencies = dependencies;
      component.flattenedDevDependencies = devDependencies;
    });
  }

  private createGraphs(components: Component[]) {
    this.dependenciesGraph = buildComponentsGraphCombined(components);
    // uncomment to see the graph nicely. very helpful for debugging
    // console.log("this.dependenciesGraph", this.dependenciesGraph.toString())
    this.prodGraph = this.dependenciesGraph.getSubGraphByEdgeType('dependencies');
  }

  private async importExternalDependenciesInBulk() {
    const allDependencies = this.components.map((component) => {
      return getEdges(this.dependenciesGraph, component.id.toString());
    });
    const idsStr: string[] = R.uniq(R.flatten(allDependencies));
    const bitIds = idsStr
      .filter((id) => id)
      .map((idStr) => this.dependenciesGraph.node(idStr))
      .filter((bitId: BitId) => bitId && bitId.hasScope())
      .filter((bitId) => !this.components.find((c) => c.id.isEqual(bitId)));
    const scopeComponentsImporter = ScopeComponentsImporter.getInstance(this.scope);
    this.versionDependencies = await scopeComponentsImporter.importMany(BitIds.fromArray(bitIds));
  }

  private async getFlattened(bitId: BitId): Promise<Deps> {
    const { dependencies, devDependencies } = this.getFlattenedFromCurrentComponents(bitId);
    [...dependencies, ...devDependencies].forEach((dep) => throwWhenDepNotIncluded(bitId, dep));
    const dependenciesDeps = await mapSeries(dependencies, (dep) => this.getFlattenedFromVersion(dep));
    const devDependenciesDeps = await mapSeries(dependencies, (dep) => this.getFlattenedFromVersion(dep));
    const dependenciesDepsFlattened = flatten(dependenciesDeps.map((d) => d.dependencies));
    const devDependenciesDepsFlattened = flatten([
      ...dependenciesDeps.map((d) => d.devDependencies),
      ...devDependenciesDeps.map((d) => d.dependencies),
      ...devDependenciesDeps.map((d) => d.devDependencies),
    ]);
    dependencies.push(...dependenciesDepsFlattened);
    devDependencies.push(...devDependenciesDepsFlattened);
    return { dependencies: BitIds.uniqFromArray(dependencies), devDependencies: BitIds.uniqFromArray(devDependencies) };
  }

  private getFlattenedFromCurrentComponents(bitId: BitId): { dependencies: BitId[]; devDependencies: BitId[] } {
    const prodDeps = getEdges(this.prodGraph, bitId.toString()) || [];
    const allDeps = getEdges(this.dependenciesGraph, bitId.toString()) || [];
    const devDeps = allDeps.filter((dep) => !prodDeps.includes(dep));
    const dependencies = prodDeps.map((idStr) => this.dependenciesGraph.node(idStr));
    const devDependencies = devDeps.map((idStr) => this.dependenciesGraph.node(idStr));
    return { dependencies, devDependencies };
  }

  private async getFlattenedFromVersion(id: BitId): Promise<Deps> {
    if (!this.cache[id.toString()]) {
      const versionDeps = this.versionDependencies.find(({ component }) => component.toId().isEqual(id));
      const emptyDeps = { dependencies: new BitIds(), devDependencies: new BitIds() };
      if (versionDeps) {
        const dependencies = await versionDeps.component.flattenedDependencies(this.scope.objects);
        const devDependencies = await versionDeps.component.flattenedDevDependencies(this.scope.objects);
        this.cache[id.toString()] = { dependencies, devDependencies };
      } else {
        const existing = this.components.find((c) => c.id.isEqual(id));
        if (existing) {
          this.cache[id.toString()] = emptyDeps;
        } else {
          const fromModel = await this.scope.getVersionInstance(id);
          this.cache[id.toString()] = {
            dependencies: fromModel.flattenedDependencies,
            devDependencies: fromModel.flattenedDevDependencies,
          };
        }
      }
    }
    return this.cache[id.toString()];
  }
}

function throwWhenDepNotIncluded(componentId: BitId, dependencyId: BitId) {
  if (!dependencyId.hasScope() && !dependencyId.hasVersion()) {
    throw new GeneralError(`fatal: "${componentId.toString()}" has a dependency "${dependencyId.toString()}".
this dependency was not included in the tag command.`);
  }
}

function getEdges(graph: GraphLib, id: BitIdStr): BitIdStr[] | null {
  if (!graph.hasNode(id)) return null;
  // @ts-ignore
  const edges = graphlib.alg.preorder(graph, id);
  return R.tail(edges); // the first item is the component itself
}
