import { compact } from 'lodash';
import mapSeries from 'p-map-series';
import R from 'ramda';

import { BitId, BitIds } from '../../bit-id';
import { COMPONENT_ORIGINS, LATEST_BIT_VERSION } from '../../constants';
import ConsumerComponent from '../../consumer/component';
import Consumer from '../../consumer/consumer';
import logger from '../../logger/logger';
import { Lane, ModelComponent, Symlink } from '../models';
import { Ref } from '../objects';
import RemovedObjects from '../removed-components';
import Scope from '../scope';

export default class RemoveModelComponents {
  scope: Scope;
  bitIds: BitIds;
  force: boolean;
  removeSameOrigin = false;
  consumer: Consumer | null | undefined;
  currentLane: Lane | null = null;
  constructor(scope: Scope, bitIds: BitIds, force: boolean, removeSameOrigin: boolean, consumer?: Consumer) {
    this.scope = scope;
    this.bitIds = bitIds;
    this.force = force;
    this.removeSameOrigin = removeSameOrigin;
    this.consumer = consumer;
  }

  async setCurrentLane() {
    this.currentLane = await this.scope.lanes.getCurrentLaneObject();
  }

  async remove(): Promise<RemovedObjects> {
    const { missingComponents, foundComponents } = await this.scope.filterFoundAndMissingComponents(this.bitIds);
    await this.setCurrentLane();
    const dependentBits = await this.scope.findDependentBits(foundComponents);
    if (R.isEmpty(dependentBits) || this.force) {
      // do not run this in parallel (promise.all), otherwise, it may throw an error when
      // trying to delete the same file at the same time (happens when removing a component with
      // a dependency and the dependency itself)
      const removalData = await mapSeries(foundComponents, (bitId) => this.getRemoveSingleData(bitId));
      const compIds = new BitIds(...removalData.map((x) => x.compId));
      const depsIds = new BitIds(...removalData.map((x) => x.depIds).flat());
      const allIds = [...compIds, ...depsIds];
      const refsToRemoveAll = removalData.map((removed) => removed.refsToRemove).flat();
      if (this.currentLane) {
        await this.scope.objects.writeObjectsToTheFS([this.currentLane]);
      }
      await this.scope.objects.deleteObjectsFromFS(refsToRemoveAll);
      await this.scope.objects.deleteRecordsFromUnmergedComponents(allIds.map((id) => id.name));

      const removedFromLane = Boolean(this.currentLane);
      return new RemovedObjects({
        removedComponentIds: compIds,
        missingComponents,
        removedDependencies: depsIds,
        removedFromLane,
      });
    }
    // some of the components have dependents, don't remove them
    return new RemovedObjects({ missingComponents, dependentBits });
  }

  /**
   * removeSingle - remove single component
   * @param {BitId} bitId - list of remote component ids to delete
   * @param {boolean} removeSameOrigin - remove component dependencies from same origin
   */
  async getRemoveSingleData(bitId: BitId): Promise<{ compId: BitId; depIds: BitIds; refsToRemove: Ref[] }> {
    logger.debug(`scope.removeSingle ${bitId.toString()}, remove dependencies: ${this.removeSameOrigin.toString()}`);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const component = (await this.scope.getModelComponentIfExist(bitId)).toComponentVersion();
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const consumerComponentToRemove = await component.toConsumer(this.scope.objects);
    const componentList = await this.scope.listIncludesSymlinks();

    const dependentBits = await this.scope.findDependentBits(
      consumerComponentToRemove.flattenedDependencies,
      bitId.version !== LATEST_BIT_VERSION
    );

    const { ids: depIds, refs: depsRefs } = await this.getDataForDependenciesRemoval(
      dependentBits,
      componentList,
      consumerComponentToRemove,
      bitId
    );

    const componentsRefs = await this.getDataForRemovingComponent(bitId, componentList);
    const version = Object.keys(component.component.versions).length <= 1 ? LATEST_BIT_VERSION : bitId.version;

    return {
      compId: bitId.changeVersion(version),
      depIds,
      refsToRemove: [...componentsRefs, ...depsRefs],
    };
  }

  private async getDataForDependenciesRemoval(
    dependentBits: Record<string, any>,
    componentList: Array<ModelComponent | Symlink>,
    consumerComponentToRemove: ConsumerComponent,
    bitId: BitId
  ): Promise<{ ids: BitIds; refs: Ref[] }> {
    const refsToRemove: Ref[] = [];
    const depsToRemoveP = consumerComponentToRemove.flattenedDependencies.map(async (dependencyId: BitId) => {
      const dependentsIds: BitId[] = dependentBits[dependencyId.toStringWithoutVersion()];
      const relevantDependents = R.reject(
        (dependent) => dependent.isEqual(bitId) || dependent.scope !== dependencyId.scope,
        dependentsIds
      );
      let isNested = true;
      if (this.consumer) {
        const componentMapIgnoreVersion = this.consumer.bitMap.getComponentIfExist(dependencyId, {
          ignoreVersion: true,
        });
        const componentMapExact = this.consumer.bitMap.getComponentIfExist(dependencyId);
        const componentMap = componentMapExact || componentMapIgnoreVersion;
        if (componentMap) {
          isNested = componentMap.origin === COMPONENT_ORIGINS.NESTED;
        }
      }
      if (
        R.isEmpty(relevantDependents) &&
        !this.bitIds.searchWithoutVersion(dependencyId) && // don't delete dependency if it is already deleted as an individual
        (dependencyId.scope !== bitId.scope || this.removeSameOrigin) &&
        isNested
      ) {
        const refs = await this.getDataForRemovingComponent(dependencyId, componentList);
        refsToRemove.push(...refs);
        return dependencyId;
      }
      return null;
    });
    const depsToRemove = await Promise.all(depsToRemoveP);
    return { ids: BitIds.fromArray(compact(depsToRemove)), refs: refsToRemove };
  }

  private async getDataForRemovingComponent(id: BitId, componentList: Array<ModelComponent | Symlink>): Promise<Ref[]> {
    if (this.currentLane) {
      const result = this.currentLane.removeComponent(id);
      if (!result) throw new Error(`failed deleting ${id.toString()}, the component was not found on the lane`);
      return [];
    }
    const symlink = componentList.find(
      (component) => component instanceof Symlink && id.isEqualWithoutScopeAndVersion(component.toBitId())
    );
    const refs = await this.scope.sources.getRefsForComponentRemoval(id);
    if (symlink) refs.push(symlink.hash());
    return refs;
  }
}
