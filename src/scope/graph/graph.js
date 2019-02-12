/** @flow */
import GraphLib from 'graphlib';
import semver from 'semver';
import R from 'ramda';
import { BitId, BitIds } from '../../bit-id';
import type { ModelComponent, Version } from '../models';
import { LATEST_BIT_VERSION, VERSION_DELIMITER } from '../../constants';
import Scope from '../scope';

const Graph = GraphLib.Graph;

export default class DependencyGraph {
  scope: Scope;
  graph: Graph;

  constructor(scope: Scope, graph: Object) {
    this.scope = scope;
    this.graph = graph;
  }

  static async load(scope: Scope) {
    const graph = await DependencyGraph.buildDependenciesGraph(scope);
    return new DependencyGraph(scope, graph);
  }

  static async buildDependenciesGraph(scope: Scope): Graph {
    const graph = new Graph({ compound: true });
    const depObj: { [id: string]: Version } = {};
    const allComponents = await scope.list();
    // build all nodes. a node is either a Version object or Component object.
    // each Version node has a parent of Component node. Component node doesn't have a parent.
    await Promise.all(
      allComponents.map(async (component) => {
        graph.setNode(component.id(), component);
        await Promise.all(
          Object.keys(component.versions).map(async (version) => {
            const componentVersion = await component.loadVersion(version, scope.objects);
            if (!componentVersion) return;
            const idWithVersion = `${component.id()}${VERSION_DELIMITER}${version}`;
            graph.setNode(idWithVersion, componentVersion);
            graph.setParent(idWithVersion, component.id());
            componentVersion.id = component.toBitId();
            depObj[idWithVersion] = componentVersion;
          })
        );
      })
    );
    // set all edges
    // @todo: currently the label is "require". Change it to be "direct" and "indirect" depends on whether it comes from
    // flattenedDependencies or from dependencies.
    Object.keys(depObj).forEach(id =>
      depObj[id].flattenedDependencies.forEach(dep => graph.setEdge(id, dep.toString(), 'require'))
    );
    return Promise.resolve(graph);
  }

  getComponent(id: BitId): ModelComponent {
    return this.graph.node(id.toStringWithoutVersion());
  }

  getComponentVersion(id: BitId): Version {
    if (id.version === LATEST_BIT_VERSION) {
      const component = this.getComponent();
      const versions = Object.keys(component.versions);
      const latestVersion = semver.maxSatisfying(versions, '*');
      return this.graph.node(`${id.toStringWithoutVersion()}${VERSION_DELIMITER}${latestVersion}`);
    }
    return this.graph.node(id.toString());
  }

  getDependentsPerId(id: BitId): string[] {
    const nodeEdges = this.graph.inEdges(id.toString());
    if (!nodeEdges) return [];
    return nodeEdges.map(node => node.v);
  }

  getDependenciesPerId(id: BitId): string[] {
    const nodeEdges = this.graph.outEdges(id.toString());
    if (!nodeEdges) return [];
    return nodeEdges.map(node => node.v);
  }

  getComponentVersions(id: BitId): Version[] {
    const component = this.getComponent(id);
    if (!component) return;
    return Object.keys(component.versions)
      .map(version => this.getComponentVersion(`${id.toStringWithoutVersion()}${VERSION_DELIMITER}${version}`))
      .filter(x => x);
  }

  /**
   * findDependentBits
   * foreach component in array find the componnet that uses that component
   * dont return local components
   */

  async findDependentBitsByGraph(bitIds: BitIds): Promise<Array<object>> {
    const dependentIds = {};
    bitIds.forEach((id) => {
      if (id.version === LATEST_BIT_VERSION) {
        // check if another component in the scope is using any of the versions
        const children = this.graph.children(id.toString());
        children.forEach((child) => {
          const requiredBy = this.graph.predecessors(child);
          if (requiredBy && !R.isEmpty(requiredBy)) {
            if (dependentIds[id.toStringWithoutVersion()]) {
              dependentIds[id.toStringWithoutVersion()] = dependentIds[id.toStringWithoutVersion()].concat(requiredBy);
            } else dependentIds[id.toStringWithoutVersion()] = requiredBy;
          }
        });
      } else {
        const requiredBy = this.graph.predecessors(id.toString());
        if (!R.isEmpty(requiredBy)) {
          if (dependentIds[id.toString()]) dependentIds[id.toString()] = dependentIds[id.toString()].concat(requiredBy);
          else dependentIds[id.toString()] = requiredBy;
        }
      }
    });
    return dependentIds;
  }
}
