import { compact } from 'lodash';
import mapSeries from 'p-map-series';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { LATEST_BIT_VERSION } from '@teambit/legacy.constants';
import Consumer from '../../consumer/consumer';
import { logger } from '@teambit/legacy.logger';
import { Ref, Lane } from '@teambit/scope.objects';
import { RemovedObjects } from '../removed-components';
import Scope from '../scope';

/**
 * remove components from the model.
 *
 * previously, this class also removed dependencies from the scope, see https://github.com/teambit/bit/pull/5380 for
 * more details.
 */
export default class RemoveModelComponents {
  scope: Scope;
  bitIds: ComponentIdList;
  force: boolean;
  consumer: Consumer | null | undefined;
  currentLane?: Lane | null = null;
  constructor(scope: Scope, bitIds: ComponentIdList, force: boolean, consumer?: Consumer, currentLane?: Lane | null) {
    this.scope = scope;
    this.bitIds = bitIds;
    this.force = force;
    this.consumer = consumer;
    this.currentLane = currentLane;
  }

  async remove(): Promise<RemovedObjects> {
    const { missingComponents, foundComponents } = await this.scope.filterFoundAndMissingComponents(this.bitIds);
    logger.debug(`RemoveModelComponents.remove, found ${foundComponents.length} components to remove`);
    // if this is in the workspace, it's ok to remove components that have dependents.
    // the user can always install it as a package or re-import.
    if (!this.consumer) {
      const dependentBits = await this.scope.getDependentsBitIds(foundComponents);
      logger.debug(`RemoveModelComponents.remove, found ${Object.keys(dependentBits).length} dependents`);
      if (Object.keys(dependentBits).length && !this.force) {
        // some of the components have dependents, don't remove them
        return new RemovedObjects({ missingComponents, dependentBits });
      }
    }

    const removedFromLane: ComponentID[] = [];
    const removalDataWithNulls = await mapSeries(foundComponents, (bitId) => {
      if (this.currentLane) {
        const result = this.currentLane.removeComponent(bitId);
        if (result) {
          // component was found on the lane.
          removedFromLane.push(bitId);
        }
        // component was not found on lane. it's ok, it might be on main. continue with the component removal.
      }
      return this.getRemoveSingleData(bitId);
    });
    const removalData = compact(removalDataWithNulls);
    logger.debug(`RemoveModelComponents.remove, got removalData`);
    const compIds = new ComponentIdList(...removalData.map((x) => x.compId));
    const refsToRemoveAll = removalData.map((removed) => removed.refsToRemove).flat();
    if (removedFromLane.length) {
      await this.scope.objects.writeObjectsToTheFS([this.currentLane as Lane]);
    }
    await this.scope.objects.deleteObjectsFromFS(refsToRemoveAll);
    await this.scope.objects.deleteRecordsFromUnmergedComponents(compIds);

    return new RemovedObjects({
      removedComponentIds: compIds,
      missingComponents,
      removedFromLane: ComponentIdList.fromArray(removedFromLane),
    });
  }

  private async getRemoveSingleData(bitId: ComponentID): Promise<{ compId: ComponentID; refsToRemove: Ref[] }> {
    logger.debug(`scope.removeSingle ${bitId.toString()}`);
    const component = (await this.scope.getModelComponent(bitId)).toComponentVersion();
    const componentsRefs = await this.getDataForRemovingComponent(bitId);
    const version = Object.keys(component.component.versions).length <= 1 ? LATEST_BIT_VERSION : bitId.version;

    return {
      compId: bitId.changeVersion(version),
      refsToRemove: componentsRefs,
    };
  }

  private async getDataForRemovingComponent(id: ComponentID): Promise<Ref[]> {
    const refs = await this.scope.sources.getRefsForComponentRemoval(id);
    return refs;
  }
}
