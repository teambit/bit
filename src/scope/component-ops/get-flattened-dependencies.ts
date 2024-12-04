import graphlib, { Graph as GraphLib } from 'graphlib';
import mapSeries from 'p-map-series';
import { BitError } from '@teambit/bit-error';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { BitIdStr } from '@teambit/legacy-bit-id';
import R from 'ramda';
import { Scope } from '..';
import { ConsumerComponent as Component, Dependencies } from '@teambit/legacy.consumer-component';
import logger from '../../logger/logger';
import VersionDependencies from '../version-dependencies';
import { Lane } from '../models';

export class FlattenedDependenciesGetter {
  private dependenciesGraph: GraphLib;
  private versionDependencies: VersionDependencies[];
  private cache: { [idStr: string]: ComponentIdList } = {};
  constructor(
    private scope: Scope,
    private components: Component[],
    private lane?: Lane
  ) {}

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
   */
  async populateFlattenedDependencies() {
    logger.debug(`populateFlattenedDependencies starts with ${this.components.length} components`);
    this.dependenciesGraph = buildComponentsGraphCombined(this.components);
    // console.log("this.dependenciesGraph", this.dependenciesGraph.toString())
    await this.importExternalDependenciesInBulk();
    await mapSeries(this.components, async (component) => {
      component.flattenedDependencies = await this.getFlattened(component.componentId);
    });
  }

  private async importExternalDependenciesInBulk() {
    const allDependencies = this.components.map((component) => {
      return getEdges(this.dependenciesGraph, component.id.toString());
    });
    const idsStr: string[] = R.uniq(R.flatten(allDependencies));
    const bitIds = idsStr
      .filter((id) => id)
      .map((idStr) => this.dependenciesGraph.node(idStr))
      .filter((bitId) => !this.components.find((c) => c.id.isEqual(bitId)));
    const scopeComponentsImporter = this.scope.scopeImporter;
    this.versionDependencies = await scopeComponentsImporter.importMany({
      ids: ComponentIdList.fromArray(bitIds),
      preferDependencyGraph: false,
      cache: true,
      throwForDependencyNotFound: true,
      lane: this.lane,
      reason: 'for fetching all dependencies',
    });
  }

  private async getFlattened(bitId: ComponentID): Promise<ComponentIdList> {
    const dependencies = this.getFlattenedFromCurrentComponents(bitId);
    dependencies.forEach((dep) => throwWhenDepNotIncluded(bitId, dep));
    const dependenciesDeps = await mapSeries(dependencies, (dep) => this.getFlattenedFromVersion(dep, bitId));
    const dependenciesDepsFlattened = dependenciesDeps.flat();
    // this dependenciesDepsFlattened can be huge, don't use spread operator (...) here. otherwise, it throws
    // `Maximum call stack size exceeded`. it's important to first make them uniq
    // (from a real example, before uniq: 133,068. after uniq: 2,126)
    const dependenciesDepsUniq = ComponentIdList.uniqFromArray(dependenciesDepsFlattened);
    dependencies.push(...dependenciesDepsUniq);
    return ComponentIdList.uniqFromArray(dependencies);
  }

  private getFlattenedFromCurrentComponents(bitId: ComponentID): ComponentID[] {
    const allDeps = getEdges(this.dependenciesGraph, bitId.toString()) || [];
    const dependencies = allDeps.map((idStr) => this.dependenciesGraph.node(idStr));
    return dependencies;
  }

  private async getFlattenedFromVersion(id: ComponentID, dependentId: ComponentID): Promise<ComponentIdList> {
    if (!this.cache[id.toString()]) {
      const versionDeps = this.versionDependencies.find(({ component }) => component.toComponentId().isEqual(id));
      if (versionDeps) {
        const dependencies = await versionDeps.component.flattenedDependencies(this.scope.objects);
        this.cache[id.toString()] = dependencies;
      } else {
        const existing = this.components.find((c) => c.id.isEqual(id));
        if (existing) {
          this.cache[id.toString()] = new ComponentIdList();
        } else {
          if (!id.hasVersion()) {
            throw new Error(`error found while getting the dependencies of "${dependentId.toString()}". A dependency "${id.toString()}" doesn't have a version
if this is an external env/extension/aspect configured in workspace.jsonc, make sure it is set with a version`);
          }
          const fromModel = await this.scope.getVersionInstance(id);
          this.cache[id.toString()] = fromModel.flattenedDependencies;
        }
      }
    }
    return this.cache[id.toString()];
  }
}

function throwWhenDepNotIncluded(componentId: ComponentID, dependencyId: ComponentID) {
  if (!dependencyId.hasScope() && !dependencyId.hasVersion()) {
    throw new BitError(`fatal: "${componentId.toString()}" has a dependency "${dependencyId.toString()}".
this dependency was not included in the tag command.`);
  }
}

/**
 * get all successors edges recursively (flatten)
 */
function getEdges(graph: GraphLib, id: BitIdStr): BitIdStr[] | null {
  if (!graph.hasNode(id)) return null;
  // @ts-ignore
  const edges = graphlib.alg.preorder(graph, id);
  return R.tail(edges); // the first item is the component itself
}

/**
 * one graph of the given components. it doesn't fetch/load anything. it builds the graph with the
 * given data. the node is a ComponentID and the edge has the label of the dependency type. it can be
 * either "dependencies" or "devDependencies".
 */
function buildComponentsGraphCombined(components: Component[]): GraphLib {
  const graph = new GraphLib();
  components.forEach((component) => {
    _setGraphEdges(component.id, component.dependencies, graph);
    _setGraphEdges(component.id, component.devDependencies, graph, 'devDependencies');
    _setGraphEdges(component.id, component.extensionDependencies, graph, 'devDependencies');
  });
  return graph;
}

function _setGraphEdges(bitId: ComponentID, dependencies: Dependencies, graph: GraphLib, label = 'dependencies') {
  const id = bitId.toString();
  dependencies.get().forEach((dependency) => {
    const depId = dependency.id.toString();
    // save the full ComponentID of a string id to be able to retrieve it later with no confusion
    if (!graph.hasNode(id)) graph.setNode(id, bitId);
    if (!graph.hasNode(depId)) graph.setNode(depId, dependency.id);
    graph.setEdge(id, depId, label);
  });
}
