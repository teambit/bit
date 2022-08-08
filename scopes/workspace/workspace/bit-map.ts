import { isEqual, merge } from 'lodash';
import { ComponentID } from '@teambit/component-id';
import LegacyBitMap from '@teambit/legacy/dist/consumer/bit-map';
import { Consumer } from '@teambit/legacy/dist/consumer';
import { GetBitMapComponentOptions } from '@teambit/legacy/dist/consumer/bit-map/bit-map';
import ComponentMap from '@teambit/legacy/dist/consumer/bit-map/component-map';
import { REMOVE_EXTENSION_SPECIAL_SIGN } from '@teambit/legacy/dist/consumer/config';
import { BitError } from '@teambit/bit-error';
import { LaneId } from '@teambit/lane-id';
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
  addComponentConfig(
    id: ComponentID,
    aspectId: string,
    config: Record<string, any> = {},
    shouldMergeConfig = false
  ): boolean {
    if (!aspectId || typeof aspectId !== 'string') throw new Error(`expect aspectId to be string, got ${aspectId}`);
    const bitMapEntry = this.getBitmapEntry(id, { ignoreScopeAndVersion: true });
    const currentConfig = (bitMapEntry.config ||= {})[aspectId];
    if (isEqual(currentConfig, config)) {
      return false; // no changes
    }
    const getNewConfig = () => {
      if (!config) return null;
      if (!shouldMergeConfig) return config;
      // should merge
      if (!currentConfig) return config;
      if (currentConfig === '-') return config;
      // lodash merge performs a deep merge. (the native concatenation don't)
      return merge(currentConfig, config);
    };
    const newConfig = getNewConfig();
    if (newConfig) {
      bitMapEntry.config[aspectId] = newConfig;
    } else {
      delete bitMapEntry.config[aspectId];
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

  setEntireConfig(id: ComponentID, config: Record<string, any>) {
    const bitMapEntry = this.getBitmapEntry(id, { ignoreScopeAndVersion: true });
    bitMapEntry.config = config;
    this.legacyBitMap.markAsChanged();
  }

  removeDefaultScope(id: ComponentID) {
    const bitMapEntry = this.getBitmapEntry(id, { ignoreScopeAndVersion: true });
    if (bitMapEntry.defaultScope) {
      delete bitMapEntry.defaultScope;
      this.legacyBitMap.markAsChanged();
    }
  }

  setDefaultScope(id: ComponentID, defaultScope: string) {
    const bitMapEntry = this.getBitmapEntry(id, { ignoreScopeAndVersion: true });
    bitMapEntry.defaultScope = defaultScope;
    this.legacyBitMap.markAsChanged();
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

  getAspectIdFromConfig(
    componentId: ComponentID,
    aspectId: ComponentID,
    ignoreAspectVersion = false
  ): string | undefined {
    const bitMapEntry = this.getBitmapEntry(componentId);
    const config = bitMapEntry.config;
    if (!config) {
      return undefined;
    }
    if (config[aspectId.toString()]) {
      return aspectId.toString();
    }
    if (!ignoreAspectVersion) {
      return undefined;
    }
    const allVersions = Object.keys(config).filter((id) => id.startsWith(`${aspectId.toStringWithoutVersion()}@`));
    if (allVersions.length > 1) {
      throw new BitError(
        `error: the same aspect ${
          aspectId.toStringWithoutVersion
        } configured multiple times for "${componentId.toString()}"\n${allVersions.join('\n')}`
      );
    }
    return allVersions.length === 1 ? allVersions[0] : undefined;
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

  /**
   * this is the lane-id of the recently exported lane. in case of a new lane, which was not exported yet, this will be
   * empty.
   */
  getExportedLaneId(): LaneId | undefined {
    return this.legacyBitMap.isLaneExported ? this.legacyBitMap.laneId : undefined;
  }

  /**
   * whether .bitmap file has changed in-memory
   */
  hasChanged(): boolean {
    return this.legacyBitMap.hasChanged;
  }
}
