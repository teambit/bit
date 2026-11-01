import type { ComponentIdList } from '@teambit/component-id';
import { RemovedObjects } from '@teambit/legacy.scope';

export class RemovedLocalObjects extends RemovedObjects {
  modifiedComponents?: ComponentIdList;
  constructor(
    removedComponentIds?: ComponentIdList,
    missingComponents?: ComponentIdList,
    modifiedComponents?: ComponentIdList,
    dependentBits?: Record<string, any>,
    removedFromLane?: ComponentIdList
  ) {
    super({ removedComponentIds, missingComponents, dependentBits, removedFromLane });
    this.modifiedComponents = modifiedComponents;
  }
}
