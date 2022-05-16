import mapSeries from 'p-map-series';
import R from 'ramda';
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
  currentLane: Lane | null = null;
  constructor(scope: Scope, bitIds: BitIds, force: boolean, consumer?: Consumer) {
    this.scope = scope;
    this.bitIds = bitIds;
    this.force = force;
    this.consumer = consumer;
  }

  private async setCurrentLane() {
    this.currentLane = await this.scope.lanes.getCurrentLaneObject();
  }

  async remove(): Promise<RemovedObjects> {
    const { missingComponents, foundComponents } = await this.scope.filterFoundAndMissingComponents(this.bitIds);
    logger.debug(`RemoveModelComponents.remove, found ${foundComponents.length} components to remove`);
    await this.setCurrentLane();
    const dependentBits = await this.scope.getDependentsBitIds(foundComponents);
    logger.debug(`RemoveModelComponents.remove, found ${Object.keys(dependentBits).length} dependents`);
    if (R.isEmpty(dependentBits) || this.force) {
      const removalData = await mapSeries(foundComponents, (bitId) => this.getRemoveSingleData(bitId));
      logger.debug(`RemoveModelComponents.remove, got removalData`);
      const compIds = new BitIds(...removalData.map((x) => x.compId));
      const refsToRemoveAll = removalData.map((removed) => removed.refsToRemove).flat();
      if (this.currentLane) {
        await this.scope.objects.writeObjectsToTheFS([this.currentLane]);
      }
      await this.scope.objects.deleteObjectsFromFS(refsToRemoveAll);
      await this.scope.objects.deleteRecordsFromUnmergedComponents(compIds.map((id) => id.name));

      const removedFromLane = Boolean(this.currentLane && foundComponents.length);
      return new RemovedObjects({
        removedComponentIds: compIds,
        missingComponents,
        removedFromLane,
      });
    }
    // some of the components have dependents, don't remove them
    return new RemovedObjects({ missingComponents, dependentBits });
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
    if (this.currentLane) {
      const result = this.currentLane.removeComponent(id);
      if (!result) throw new Error(`failed deleting ${id.toString()}, the component was not found on the lane`);
      return [];
    }
    const componentList = await this.scope.listIncludesSymlinks();
    const symlink = componentList.find(
      (component) => component instanceof Symlink && id.isEqualWithoutScopeAndVersion(component.toBitId())
    );
    const refs = await this.scope.sources.getRefsForComponentRemoval(id);
    if (symlink) refs.push(symlink.hash());
    return refs;
  }
}
