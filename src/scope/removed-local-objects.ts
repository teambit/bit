import RemovedObjects from './removed-components';
import { BitIds } from '../bit-id';

export default class RemovedLocalObjects extends RemovedObjects {
  modifiedComponents: BitIds;
  constructor(
    removedComponentIds?: BitIds,
    missingComponents?: BitIds,
    modifiedComponents?: BitIds,
    removedDependencies?: BitIds,
    dependentBits?: Record<string, any>
  ) {
    super({ removedComponentIds, missingComponents, removedDependencies, dependentBits });
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.modifiedComponents = modifiedComponents;
  }
}
