/** @flow */
import GraphLib from 'graphlib';
import semver from 'semver';
import R from 'ramda';
import { Repository } from '../objects';
import { BitId, BitIds } from '../../bit-id';
import { Component, Version } from '../models';
import { LATEST_BIT_VERSION, VERSION_DELIMITER } from '../../constants';

const Graph = GraphLib.Graph;

export class DependencyGraph {
  graph: Graph;

  async load(repo: Repository) {
    this.graph = await this.buildDependencieGraph(repo);
    return this;
  }
  async buildDependencieGraph(repo: Repository): Graph {
    const graph = new Graph({ compound: true });
    const depObj = {};
    const allComponents = await repo.listComponents(false);
    await Promise.all(
      allComponents.map(async (component) => {
        graph.setNode(component.id().toString(), component);
        await Promise.all(
          Object.keys(component.versions).map(async (version) => {
            const componentVersion = await component.loadVersion(version, repo);
            if (!componentVersion) return;
            graph.setNode(`${component.id()}@${version}`, componentVersion);
            graph.setParent(`${component.id()}@${version}`, component.id().toString());
            componentVersion.id = BitId.parse(component.id());
            depObj[`${component.id()}@${version}`] = componentVersion;
          })
        );
      })
    );
    Object.keys(depObj).forEach(key =>
      depObj[key].flattenedDependencies.forEach(dep => graph.setEdge(key, dep.toString(), 'require'))
    );
    return Promise.resolve(graph);
  }

  getComponent(id: BitId): Component {
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
            if (dependentIds[id.toStringWithoutVersion()]) { dependentIds[id.toStringWithoutVersion()] = dependentIds[id.toStringWithoutVersion()].concat(requiredBy); } else dependentIds[id.toStringWithoutVersion()] = requiredBy;
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
