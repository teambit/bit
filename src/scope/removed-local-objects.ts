import { BitIds } from '../bit-id';
import RemovedObjects from './removed-components';

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
