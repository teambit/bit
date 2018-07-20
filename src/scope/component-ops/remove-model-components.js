// @flow
import R from 'ramda';
import pMapSeries from 'p-map-series';
import { RemovedObjects } from '../removed-components';
import logger from '../../logger/logger';
import { BitId, BitIds } from '../../bit-id';
import { LATEST_BIT_VERSION, COMPONENT_ORIGINS } from '../../constants';
import { Symlink } from '../models';
import ConsumerComponent from '../../consumer/component';
import Scope from '../scope';
import type { BitIdStr } from '../../bit-id/bit-id';
import { Consumer } from '../../consumer';

export default class RemoveModelComponents {
  scope: Scope;
  bitIds: BitIds;
  bitIdsStr: BitIdStr[];
  force: boolean;
  removeSameOrigin: boolean = false;
  consumer: ?Consumer;
  constructor(scope: Scope, bitIds: BitIds, force: boolean, removeSameOrigin: boolean, consumer?: Consumer) {
    this.scope = scope;
    this.bitIds = bitIds;
    this.bitIdsStr = bitIds.map(id => id.toStringWithoutVersion());
    this.force = force;
    this.removeSameOrigin = removeSameOrigin;
    this.consumer = consumer;
  }

  async remove(): Promise<RemovedObjects> {
    const { missingComponents, foundComponents } = await this.scope.filterFoundAndMissingComponents(this.bitIds);
    const dependentBits = await this.scope.findDependentBits(foundComponents);
    if (R.isEmpty(dependentBits) || this.force) {
      // do not run this in parallel (promise.all), otherwise, it may throw an error when
      // trying to delete the same file at the same time (happens when removing a component with
      // a dependency and the dependency itself)
      const removedComponents = await pMapSeries(foundComponents, bitId => this._removeSingle(bitId));
      const ids = new BitIds(...removedComponents.map(x => x.bitId));
      const removedDependencies = new BitIds(...R.flatten(removedComponents.map(x => x.removedDependencies)));
      return new RemovedObjects({ removedComponentIds: ids, missingComponents, removedDependencies });
    }
    // some of the components have dependents, don't remove them
    return new RemovedObjects({ missingComponents, dependentBits });
  }

  /**
   * removeSingle - remove single component
   * @param {BitId} bitId - list of remote component ids to delete
   * @param {boolean} removeSameOrigin - remove component dependencies from same origin
   */
  async _removeSingle(bitId: BitId): Promise<{ bitId: BitId, removedDependencies: BitIds }> {
    logger.debug(`scope.removeSingle ${bitId.toString()}, remove dependencies: ${this.removeSameOrigin.toString()}`);
    // $FlowFixMe
    const component = (await this.scope.sources.get(bitId)).toComponentVersion();
    const consumerComponentToRemove = await component.toConsumer(this.scope.objects);
    const componentList = await this.scope.objects.listComponents();

    const dependentBits = await this.scope.findDependentBits(
      consumerComponentToRemove.flattenedDependencies,
      bitId.version !== LATEST_BIT_VERSION
    );

    const removedDependencies = await this._removeComponentsDependencies(
      dependentBits,
      componentList,
      consumerComponentToRemove,
      bitId
    );

    await this._removeComponent(bitId, componentList, false);
    if (Object.keys(component.component.versions).length <= 1) bitId.version = LATEST_BIT_VERSION;

    return { bitId, removedDependencies };
  }

  async _removeComponentsDependencies(
    dependentBits: Object,
    componentList: Array<ConsumerComponent | Symlink>,
    consumerComponentToRemove: ConsumerComponent,
    bitId: BitId
  ): Promise<BitIds> {
    const removedComponents = consumerComponentToRemove.flattenedDependencies.map(async (dependencyId: BitId) => {
      const dependentsIdsStr: BitIdStr[] = dependentBits[dependencyId.toStringWithoutVersion()];
      const bitIdStr = bitId.version === LATEST_BIT_VERSION ? bitId.toStringWithoutVersion() : bitId.toString();
      const relevantDependents = R.reject(
        dependent => dependent === bitIdStr || BitId.parse(dependent).scope !== dependencyId.scope,
        dependentsIdsStr
      );
      let isNested = true;
      if (this.consumer) {
        const componentMap = this.consumer.bitMap.getComponentIfExist(dependencyId);
        if (componentMap && componentMap.origin !== COMPONENT_ORIGINS.NESTED) {
          isNested = false;
        }
      }
      if (
        R.isEmpty(relevantDependents) &&
        !this.bitIdsStr.includes(dependencyId.toStringWithoutVersion()) && // don't delete dependency if it is already deleted as an individual
        (dependencyId.scope !== bitId.scope || this.removeSameOrigin) &&
        isNested
      ) {
        await this._removeComponent(dependencyId, componentList, true);
        return dependencyId;
      }
      return null;
    });
    let removedDependencies = await Promise.all(removedComponents);
    removedDependencies = removedDependencies.filter(x => !R.isNil(x));
    return new BitIds(removedDependencies);
  }

  async _removeComponent(id: BitId, componentList: Array<ConsumerComponent | Symlink>, removeRefs: boolean = false) {
    const symlink = componentList.filter(
      component => component instanceof Symlink && component.id() === id.toStringWithoutScopeAndVersion()
    );
    await this.scope.sources.clean(id, removeRefs);
    if (!R.isEmpty(symlink)) await this.scope.objects.remove(symlink[0].hash());
  }
}
