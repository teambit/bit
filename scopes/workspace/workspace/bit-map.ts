import { isEqual } from 'lodash';
import { ComponentID } from '@teambit/component-id';
import LegacyBitMap from '@teambit/legacy/dist/consumer/bit-map';
import { Consumer } from '@teambit/legacy/dist/consumer';
import { GetBitMapComponentOptions } from '@teambit/legacy/dist/consumer/bit-map/bit-map';
import ComponentMap from '@teambit/legacy/dist/consumer/bit-map/component-map';
import { REMOVE_EXTENSION_SPECIAL_SIGN } from '@teambit/legacy/dist/consumer/config';
/**
 * consider extracting to a new component.
 * (pro: making Workspace aspect smaller. con: it's an implementation details of the workspace)
 */
export class BitMap {
  constructor(private legacyBitMap: LegacyBitMap, private consumer: Consumer) {}

  /**
   * adds component config to the .bitmap file.
   * later, upon `bit tag`, the data is saved in the scope.
   * returns a boolean indicating whether a change has been made.
   */
  addComponentConfig(id: ComponentID, aspectId: string, config: Record<string, any> = {}): boolean {
    if (!aspectId || typeof aspectId !== 'string') throw new Error(`expect aspectId to be string, got ${aspectId}`);
    const bitMapEntry = this.getBitmapEntry(id, { ignoreScopeAndVersion: true });
    const currentConfig = (bitMapEntry.config ||= {})[aspectId];
    if (isEqual(currentConfig, config)) {
      return false; // no changes
    }
    if (!config) {
      delete bitMapEntry.config[aspectId];
    } else {
      bitMapEntry.config[aspectId] = config;
    }
    this.legacyBitMap.markAsChanged();

    return true; // changes have been made
  }

  removeComponentConfig(id: ComponentID, aspectId: string, markWithMinusIfNotExist: boolean): boolean {
    if (!aspectId || typeof aspectId !== 'string') throw new Error(`expect aspectId to be string, got ${aspectId}`);
    const bitMapEntry = this.getBitmapEntry(id, { ignoreScopeAndVersion: true });
    const currentConfig = (bitMapEntry.config ||= {})[aspectId];
    if (currentConfig) {
      delete bitMapEntry.config[aspectId];
    } else {
      if (!markWithMinusIfNotExist) {
        return false; // no changes
      }
      bitMapEntry.config[aspectId] = REMOVE_EXTENSION_SPECIAL_SIGN;
    }

    this.legacyBitMap.markAsChanged();

    return true; // changes have been made
  }

  removeEntireConfig(id: ComponentID): boolean {
    const bitMapEntry = this.getBitmapEntry(id, { ignoreScopeAndVersion: true });
    if (!bitMapEntry.config) return false;
    delete bitMapEntry.config;
    this.legacyBitMap.markAsChanged();
    return true;
  }

  /**
   * write .bitmap object to the filesystem
   */
  async write() {
    await this.consumer.writeBitMap();
  }

  /**
   * get the data saved in the .bitmap file for this component-id.
   */
  getBitmapEntry(
    id: ComponentID,
    { ignoreVersion, ignoreScopeAndVersion }: GetBitMapComponentOptions = {}
  ): ComponentMap {
    return this.legacyBitMap.getComponent(id._legacy, { ignoreVersion, ignoreScopeAndVersion });
  }

  /**
   * components that were not tagged yet are safe to rename them from the .bitmap file.
   */
  renameNewComponent(sourceId: ComponentID, targetId: ComponentID) {
    const bitMapEntry = this.getBitmapEntry(sourceId);
    if (bitMapEntry.id.hasVersion()) {
      throw new Error(`unable to rename tagged or exported component: ${bitMapEntry.id.toString()}`);
    }
    this.legacyBitMap.removeComponent(bitMapEntry.id);
    bitMapEntry.id = targetId._legacy;
    this.legacyBitMap.setComponent(bitMapEntry.id, bitMapEntry);
  }
}
