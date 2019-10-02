// @flow
import R from 'ramda';
import semver from 'semver';
import graphlib, { Graph } from 'graphlib';
import type ModelComponent from '../models/model-component';
import { BitId, BitIds } from '../../bit-id';
import Scope from '../scope';
import type { ComponentsAndVersions } from '../scope';
import { Dependency } from '../../consumer/component/dependencies';
import Component from '../../consumer/component/consumer-component';

const removeNils = R.reject(R.isNil);

export type AutoTagResult = { component: ModelComponent, triggeredBy: BitIds };

/**
 * bumping dependencies version, so-called "auto tagging" is needed when the currently tagged
 * component has dependents. these dependents should have the updated version of the currently
 * tagged component.
 *
 * to successfully accomplish the auto-tag, we do it with two rounds.
 * it's easier to understand why another round of updateComponents() is needed by an example.
 * say we have 3 components, bar/foo@0.0.1 depends on utils/is-string, utils/is-string@0.0.1 depends on
 * utils/is-type, utils/is-type@0.0.1 with no dependencies.
 * when utils/is-type is tagged, utils/is-string and bar/foo are updated in the first updateComponents() round.
 * by looking at bar/foo dependencies, we find out that its utils/is-type dependency was updated to 0.0.2
 * however, its utils/is-string dependency stays with 0.0.1, because utils/is-string was never part of
 * taggedComponents array.
 * this second round of updateComponents() makes sure that the auto-tagged components will be updated as well.
 *
 * another case when round2 is needed is when the tagged component has a cycle dependency.
 * for example, A => B => C => A, and C is now tagged. the component C has the components A and B
 * in its flattenedDependencies.
 * Round1 updates A and B. It changes the C dependency to be 0.0.2 and bump their version to 0.0.2.
 * Round2 updates the dependencies and flattenedDependencies of C to have A and B with version 0.0.2.
 */
export async function bumpDependenciesVersions(
  scope: Scope,
  potentialComponents: BitIds,
  taggedComponents: Component[]
): Promise<AutoTagResult[]> {
  const taggedComponentsIds = BitIds.fromArray(taggedComponents.map(c => c.id));
  const allComponents = new BitIds(...potentialComponents, ...taggedComponentsIds);
  const componentsAndVersions: ComponentsAndVersions[] = await scope.getComponentsAndVersions(allComponents);
  const graph = buildGraph(componentsAndVersions);
  const updatedComponents = await updateComponents(
    componentsAndVersions,
    scope,
    taggedComponentsIds,
    taggedComponentsIds,
    false,
    graph
  );
  if (updatedComponents.length) {
    const ids = updatedComponents.map(({ component }) => component.toBitIdWithLatestVersion());
    await updateComponents(componentsAndVersions, scope, taggedComponentsIds, BitIds.fromArray(ids), true, graph);
  }
  return updatedComponents;
}

async function updateComponents(
  componentsAndVersions: ComponentsAndVersions[],
  scope: Scope,
  taggedComponents: BitIds,
  changedComponents: BitIds,
  isRound2 = false,
  graph: Object
): Promise<AutoTagResult[]> {
  const autoTagResults: AutoTagResult[] = [];
  const componentsToUpdateP = componentsAndVersions.map(async ({ component, version }) => {
    let pendingUpdate = false;
    const bitId = component.toBitId();
    const idStr = bitId.toStringWithoutVersion();
    if (!graph.hasNode(idStr)) return null;
    const taggedId = taggedComponents.searchWithoutVersion(bitId);
    const isTaggedComponent = Boolean(taggedId);
    if (isTaggedComponent && !isRound2) {
      // if isCommittedComponent is true, the only case it's needed to be updated is when it has
      // cycle dependencies. in that case, it should be updated on the round2 only.
      return null;
    }
    const allDependencies = graphlib.alg.preorder(graph, idStr); // same as flattenDependencies
    const triggeredBy = new BitIds();
    allDependencies.forEach((dependency: string) => {
      const dependencyId: BitId = graph.node(dependency);
      const changedComponentId = changedComponents.searchWithoutVersion(dependencyId);
      if (changedComponentId && semver.gt(changedComponentId.version, dependencyId.version)) {
        updateDependencies(version, dependencyId, changedComponentId);
        pendingUpdate = true;
        triggeredBy.push(dependencyId);
      }
    });
    if (pendingUpdate) {
      const message = isTaggedComponent ? version.log.message : 'bump dependencies versions';
      const getVersionToAdd = (): string => {
        if (isRound2) {
          // in case round2 updates the same component it updated in round1 or updated during the
          // tag, we should use the same updated version, and not creating a new version.
          if (isTaggedComponent) {
            // $FlowFixMe
            return taggedId.version;
          }
          const componentChangedInRound1 = changedComponents.searchWithoutVersion(bitId);
          if (componentChangedInRound1) {
            // $FlowFixMe
            return componentChangedInRound1.version;
          }
        }
        // it's round 1 or it's round2 but wasn't updated before. create a new version
        return component.getVersionToAdd();
      };
      const versionToAdd = getVersionToAdd();
      autoTagResults.push({ component, triggeredBy });
      return scope.sources.putAdditionalVersion(component, version, message, versionToAdd);
    }
    return null;
  });
  await Promise.all(componentsToUpdateP);
  return autoTagResults;
}

function updateDependencies(version, edgeId, changedComponentId) {
  version.updateFlattenedDependency(edgeId, edgeId.changeVersion(changedComponentId.version));
  const dependencyToUpdate = version
    .getAllDependencies()
    .find(dependency => dependency.id.isEqualWithoutVersion(edgeId));
  if (dependencyToUpdate) {
    // it's a direct dependency
    dependencyToUpdate.id = dependencyToUpdate.id.changeVersion(changedComponentId.version);
  }
}

function buildGraph(componentsAndVersions: ComponentsAndVersions[]) {
  const graph = new Graph();
  const componentsIds = BitIds.fromArray(componentsAndVersions.map(c => c.component.toBitId()));
  componentsAndVersions.forEach(({ component, version, versionStr }) => {
    const id = component.id();
    version.getAllDependencies().forEach((dependency: Dependency) => {
      if (componentsIds.searchWithoutVersion(dependency.id)) {
        const depId = dependency.id.toStringWithoutVersion();
        // save the full BitId of a string id to be able to retrieve it later with no confusion
        if (!graph.hasNode(id)) graph.setNode(id, component.toBitId().changeVersion(versionStr));
        if (!graph.hasNode(depId)) graph.setNode(depId, dependency.id);
        graph.setEdge(id, depId);
      }
    });
  });
  return graph;
}

export async function getAutoTagPending(
  scope: Scope,
  potentialComponents: BitIds,
  changedComponents: BitIds
): Promise<ModelComponent[]> {
  const componentsAndVersions: ComponentsAndVersions[] = await scope.getComponentsAndVersions(
    new BitIds(...potentialComponents, ...changedComponents)
  );
  const graph = buildGraph(componentsAndVersions);

  const autoTagPendingComponents = componentsAndVersions.map(({ component }) => {
    const bitId = component.toBitId();
    const idStr = bitId.toStringWithoutVersion();
    if (!graph.hasNode(idStr)) return null;
    const edges = graphlib.alg.preorder(graph, idStr);
    const isAutoTagPending = edges.some((edge) => {
      const edgeId: BitId = graph.node(edge);
      const changedComponentId = changedComponents.searchWithoutVersion(edgeId);
      if (!changedComponentId) return false;
      if (changedComponents.searchWithoutVersion(bitId)) return false;
      // we only check whether a modified component may cause auto-tagging
      // since it's only modified on the file-system, its version might be the same as the version stored in its
      // dependents. That's why "semver.gte" is used instead of "semver.gt".
      return semver.gte(changedComponentId.version, edgeId.version);
    });
    return isAutoTagPending ? component : null;
  });

  return removeNils(autoTagPendingComponents);
}
