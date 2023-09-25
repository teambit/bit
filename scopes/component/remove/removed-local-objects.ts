import { BitIds } from '@teambit/legacy/dist/bit-id';
import RemovedObjects from '@teambit/legacy/dist/scope/removed-components';

export default class RemovedLocalObjects extends RemovedObjects {
  modifiedComponents: BitIds;
  constructor(
    removedComponentIds?: BitIds,
    missingComponents?: BitIds,
    modifiedComponents?: BitIds,
    dependentBits?: Record<string, any>,
    removedFromLane?: BitIds
  ) {
    super({ removedComponentIds, missingComponents, dependentBits, removedFromLane });
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.modifiedComponents = modifiedComponents;
  }
}
