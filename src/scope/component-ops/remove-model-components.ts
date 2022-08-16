import { compact } from 'lodash';
import mapSeries from 'p-map-series';
import { BitId, BitIds } from '../../bit-id';
import { LATEST_BIT_VERSION } from '../../constants';
import Consumer from '../../consumer/consumer';
import logger from '../../logger/logger';
import { Lane, Symlink } from '../models';
import { Ref } from '../objects';
import RemovedObjects from '../removed-components';
import Scope from '../scope';

/**
 * remove components from the model.
 *
 * previously, this class also removed dependencies from the scope, see https://github.com/teambit/bit/pull/5380 for
 * more details.
 */
export default class RemoveModelComponents {
  scope: Scope;
  bitIds: BitIds;
  force: boolean;
  consumer: Consumer | null | undefined;
  currentLane?: Lane | null = null;
  constructor(scope: Scope, bitIds: BitIds, force: boolean, consumer?: Consumer, currentLane?: Lane | null) {
    this.scope = scope;
    this.bitIds = bitIds;
    this.force = force;
    this.consumer = consumer;
    this.currentLane = currentLane;
  }

  async remove(): Promise<RemovedObjects> {
    const { missingComponents, foundComponents } = await this.scope.filterFoundAndMissingComponents(this.bitIds);
    logger.debug(`RemoveModelComponents.remove, found ${foundComponents.length} components to remove`);
    const dependentBits = await this.scope.getDependentsBitIds(foundComponents);
    logger.debug(`RemoveModelComponents.remove, found ${Object.keys(dependentBits).length} dependents`);
    if (Object.keys(dependentBits).length && !this.force) {
      // some of the components have dependents, don't remove them
      return new RemovedObjects({ missingComponents, dependentBits });
    }
    const removedFromLane: BitId[] = [];
    const removalDataWithNulls = await mapSeries(foundComponents, (bitId) => {
      if (this.currentLane) {
        const result = this.currentLane.removeComponent(bitId);
        if (result) {
          // component was found on the lane.
          removedFromLane.push(bitId);
          return null;
        }
        // component was not found on lane. it's ok, it might be on main. continue with the component removal.
      }
      return this.getRemoveSingleData(bitId);
    });
    const removalData = compact(removalDataWithNulls);
    logger.debug(`RemoveModelComponents.remove, got removalData`);
    const compIds = new BitIds(...removalData.map((x) => x.compId));
    const refsToRemoveAll = removalData.map((removed) => removed.refsToRemove).flat();
    if (removedFromLane.length) {
      await this.scope.objects.writeObjectsToTheFS([this.currentLane as Lane]);
    }
    await this.scope.objects.deleteObjectsFromFS(refsToRemoveAll);
    await this.scope.objects.deleteRecordsFromUnmergedComponents(compIds.map((id) => id.name));

    return new RemovedObjects({
      removedComponentIds: compIds,
      missingComponents,
      removedFromLane: BitIds.fromArray(removedFromLane),
    });
  }

  private async getRemoveSingleData(bitId: BitId): Promise<{ compId: BitId; refsToRemove: Ref[] }> {
    logger.debug(`scope.removeSingle ${bitId.toString()}`);
    const component = (await this.scope.getModelComponent(bitId)).toComponentVersion();
    const componentsRefs = await this.getDataForRemovingComponent(bitId);
    const version = Object.keys(component.component.versions).length <= 1 ? LATEST_BIT_VERSION : bitId.version;

    return {
      compId: bitId.changeVersion(version),
      refsToRemove: componentsRefs,
    };
  }

  private async getDataForRemovingComponent(id: BitId): Promise<Ref[]> {
    const componentList = await this.scope.listIncludesSymlinks();
    const symlink = componentList.find(
      (component) => component instanceof Symlink && id.isEqualWithoutScopeAndVersion(component.toBitId())
    );
    const refs = await this.scope.sources.getRefsForComponentRemoval(id);
    if (symlink) refs.push(symlink.hash());
    return refs;
  }
}
