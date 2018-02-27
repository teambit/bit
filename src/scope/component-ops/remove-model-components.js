// @flow
import R from 'ramda';
import pMapSeries from 'p-map-series';
import { RemovedObjects } from '../removed-components';
import logger from '../../logger/logger';
import { BitId, BitIds } from '../../bit-id';
import { LATEST_BIT_VERSION } from '../../constants';
import { Symlink } from '../models';
import ConsumerComponent from '../../consumer/component';
import Scope from '../scope';

export default class RemoveModelComponents {
  scope: Scope;
  bitIds: BitIds;
  force: boolean;
  removeSameOrigin: boolean = false;
  constructor(scope: Scope, bitIds: BitIds, force: boolean, removeSameOrigin: boolean) {
    this.scope = scope;
    this.bitIds = bitIds;
    this.force = force;
    this.removeSameOrigin = removeSameOrigin;
  }

  async remove() {
    const { missingComponents, foundComponents } = await this.scope.filterFoundAndMissingComponents(this.bitIds);
    const dependentBits = await this.scope.findDependentBits(foundComponents);
    if (R.isEmpty(dependentBits) || this.force) {
      // do not run this in parallel (promise.all), otherwise, it may throw an error when
      // trying to delete the same file at the same time (happens when removing a component with
      // a dependency and the dependency itself)
      const removedComponents = await pMapSeries(foundComponents, bitId => this._removeSingle(bitId));
      const ids = removedComponents.map(x => x.bitId);
      const removedDependencies = R.flatten(removedComponents.map(x => x.removedDependencies));
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
  async _removeSingle(bitId: BitId): Promise<Object> {
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
  ): Promise<BitId[]> {
    const removedComponents = consumerComponentToRemove.flattenedDependencies.map(async (id) => {
      const arr = dependentBits[id.toStringWithoutVersion()];
      const name = bitId.version === LATEST_BIT_VERSION ? bitId.toStringWithoutVersion() : bitId.toString();
      const depArr = R.reject(num => num === name || BitId.parse(num).scope !== id.scope, arr);
      if (R.isEmpty(depArr) && (id.scope !== bitId.scope || this.removeSameOrigin)) {
        await this._removeComponent(id, componentList, true);
        return id;
      }
      return null;
    });
    return (await Promise.all(removedComponents)).filter(x => !R.isNil(x));
  }

  async _removeComponent(id: BitId, componentList: Array<ConsumerComponent | Symlink>, removeRefs: boolean = false) {
    const symlink = componentList.filter(
      component => component instanceof Symlink && component.id() === id.toStringWithoutScopeAndVersion()
    );
    await this.scope.sources.clean(id, removeRefs);
    if (!R.isEmpty(symlink)) await this.scope.objects.remove(symlink[0].hash());
  }
}
