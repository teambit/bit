import graphlib, { Graph } from 'graphlib';
import R from 'ramda';
import semver from 'semver';

import { BitId, BitIds } from '../../bit-id';
import { Consumer } from '../../consumer';
import Component from '../../consumer/component/consumer-component';
import { Dependency } from '../../consumer/component/dependencies';
import { isTag } from '../../version/version-parser';
import { buildOneGraphForComponents } from '../graph/components-graph';
import DependencyGraph from '../graph/scope-graph';
import ModelComponent from '../models/model-component';
import Scope, { ComponentsAndVersions } from '../scope';

const removeNils = R.reject(R.isNil);

export type AutoTagResult = { component: Component; triggeredBy: BitIds };

export async function getAutoTagData(consumer: Consumer, ids: BitIds): Promise<AutoTagResult[]> {
  const potentialIds = consumer.bitMap.getAuthoredAndImportedBitIds();
  const depGraphConsumer = await buildOneGraphForComponents(potentialIds, consumer);
  const dependencyGraph = new DependencyGraph(depGraphConsumer);
  const autoTagData: AutoTagResult[] = [];
  const addToAutoTagData = (component: Component, triggeredBy: BitId) => {
    const existingItem = autoTagData.find((autoTagItem) => autoTagItem.component.id.isEqual(component.id));
    if (existingItem) {
      existingItem.triggeredBy.push(triggeredBy);
    } else {
      autoTagData.push({ component, triggeredBy: new BitIds(triggeredBy) });
    }
  };
  ids.forEach((id) => {
    const idStr = id.toString();
    const dependentsIdsStr = dependencyGraph.getRecursiveDependents([idStr]);
    const dependents: Component[] = dependentsIdsStr.map((dependentId) => depGraphConsumer.node(dependentId));
    const autoTagDependents = dependents
      .filter((dependent) => !ids.has(dependent.id))
      .filter((dependent) => potentialIds.has(dependent.id)); // removes nested
    autoTagDependents.forEach((dependent) => {
      addToAutoTagData(dependent, id);
    });
  });

  return autoTagData;
}

function buildGraph(componentsAndVersions: ComponentsAndVersions[]): Graph {
  const graph = new Graph();
  const componentsIds = BitIds.fromArray(componentsAndVersions.map((c) => c.component.toBitId()));
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
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    new BitIds(...potentialComponents, ...changedComponents)
  );
  const graph = buildGraph(componentsAndVersions);

  const autoTagPendingComponents = componentsAndVersions.map(({ component }) => {
    const bitId = component.toBitId();
    const idStr = bitId.toStringWithoutVersion();
    if (!graph.hasNode(idStr)) return null;
    // edges are dependencies. we loop over the dependencies of a component
    // @ts-ignore
    const edges = graphlib.alg.preorder(graph, idStr);
    const isAutoTagPending = edges.some((edge) => {
      const edgeId: BitId = graph.node(edge);
      const changedComponentId = changedComponents.searchWithoutVersion(edgeId);
      if (!changedComponentId) {
        // the dependency hasn't changed, so the component is not auto-tag pending
        return false;
      }
      if (changedComponents.searchWithoutVersion(bitId)) {
        // the dependency has changed but also the component itself, so it's going to be tagged anyway
        return false;
      }
      // we only check whether a modified component may cause auto-tagging
      // since it's only modified on the file-system, its version might be the same as the version stored in its
      // dependents. That's why "semver.gte" is used instead of "semver.gt".
      // the case when it returns false is when the changedComponentId.version is smaller than
      // edgeId.version. it happens for example, when A => B (A depends on B), B has changed, A is
      // a candidate. A has the B dependency saved in the model with version 2.0.0 and B is now
      // tagged with 1.0.1. So, because A has B with a higher version already, we don't want to
      // auto-tag it and downgrade its B version.
      if (isTag(changedComponentId.version) && isTag(edgeId.version)) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return semver.gte(changedComponentId.version!, edgeId.version!);
      }
      // when they're not tags but snaps, it is impossible to snap from a detached head so a
      // component is always candidate when its dependencies have changed.
      return true;
    });
    return isAutoTagPending ? component : null;
  });

  return removeNils(autoTagPendingComponents);
}
