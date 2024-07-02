import { isEqual, merge } from 'lodash';
import { ComponentID } from '@teambit/component-id';
import { BitMap as LegacyBitMap, ComponentMap, GetBitMapComponentOptions } from '@teambit/legacy.bit-map';
import { Consumer } from '@teambit/legacy/dist/consumer';
import { REMOVE_EXTENSION_SPECIAL_SIGN } from '@teambit/legacy/dist/consumer/config';
import { BitError } from '@teambit/bit-error';
import { LaneId } from '@teambit/lane-id';
import { EnvsAspect } from '@teambit/envs';
import { getPathStatIfExist, PathOsBasedAbsolute } from '@teambit/legacy.utils';

export type MergeOptions = {
  mergeStrategy?: 'theirs' | 'ours' | 'manual';
};
/**
 * consider extracting to a new component.
 * (pro: making Workspace aspect smaller. con: it's an implementation details of the workspace)
 */
export class BitMap {
  constructor(private legacyBitMap: LegacyBitMap, private consumer: Consumer) {}

  mergeBitmaps(bitmapContent: string, otherBitmapContent: string, opts: MergeOptions = {}): string {
    return LegacyBitMap.mergeContent(bitmapContent, otherBitmapContent, opts);
  }

  getPath(): PathOsBasedAbsolute {
    return this.legacyBitMap.mapPath;
  }

  getAllRootDirs(): string[] {
    return Object.keys(this.legacyBitMap.getAllTrackDirs());
  }

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
    const bitMapEntry = this.getBitmapEntry(id, { ignoreVersion: true });
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

  updateDefaultScope(oldScope: string, newScope: string) {
    const changedId: ComponentID[] = [];
    this.legacyBitMap.components.forEach((componentMap) => {
      // only new components (not snapped/tagged) can be changed
      if (componentMap.defaultScope === oldScope && !componentMap.id.hasVersion()) {
        componentMap.defaultScope = newScope;
        componentMap.id = componentMap.id.changeDefaultScope(newScope);
        changedId.push(componentMap.id);
      }
    });
    if (changedId.length) {
      this.legacyBitMap.markAsChanged();
    }
    return changedId;
  }

  markAsChanged() {
    this.legacyBitMap.markAsChanged();
  }

  removeComponentConfig(id: ComponentID, aspectId: string, markWithMinusIfNotExist: boolean): boolean {
    if (!aspectId || typeof aspectId !== 'string') throw new Error(`expect aspectId to be string, got ${aspectId}`);
    const bitMapEntry = this.getBitmapEntry(id, { ignoreVersion: true });
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
    const bitMapEntry = this.getBitmapEntry(id, { ignoreVersion: true });
    if (!bitMapEntry.config) return false;
    delete bitMapEntry.config;
    this.legacyBitMap.markAsChanged();
    return true;
  }

  setEntireConfig(id: ComponentID, config: Record<string, any>) {
    const bitMapEntry = this.getBitmapEntry(id, { ignoreVersion: true });
    bitMapEntry.config = config;
    this.legacyBitMap.markAsChanged();
  }

  removeDefaultScope(id: ComponentID) {
    const bitMapEntry = this.getBitmapEntry(id, { ignoreVersion: true });
    if (bitMapEntry.defaultScope) {
      delete bitMapEntry.defaultScope;
      this.legacyBitMap.markAsChanged();
    }
  }

  setDefaultScope(id: ComponentID, defaultScope: string) {
    const bitMapEntry = this.getBitmapEntry(id, { ignoreVersion: true });
    bitMapEntry.defaultScope = defaultScope;
    bitMapEntry.id = bitMapEntry.id.changeDefaultScope(defaultScope);
    this.legacyBitMap.markAsChanged();
  }

  /**
   * write .bitmap object to the filesystem
   * optionally pass a reason for the change to be saved in the local scope `bitmap-history-metadata.txt` file.
   */
  async write(reasonForChange?: string) {
    await this.consumer.writeBitMap(reasonForChange);
  }

  /**
   * get the data saved in the .bitmap file for this component-id.
   * throws if not found
   * @see this.getBitmapEntryIfExist
   */
  getBitmapEntry(id: ComponentID, { ignoreVersion }: GetBitMapComponentOptions = {}): ComponentMap {
    return this.legacyBitMap.getComponent(id, { ignoreVersion });
  }

  getBitmapEntryIfExist(id: ComponentID, { ignoreVersion }: GetBitMapComponentOptions = {}): ComponentMap | undefined {
    return this.legacyBitMap.getComponentIfExist(id, { ignoreVersion });
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
    if (sourceId.isEqual(targetId)) {
      throw new Error(`source-id and target-id are equal: "${sourceId.toString()}"`);
    }
    if (sourceId.fullName !== targetId.fullName) {
      this.legacyBitMap.removeComponent(bitMapEntry.id);
      bitMapEntry.id = targetId;
      if (sourceId.scope !== targetId.scope) bitMapEntry.defaultScope = targetId.scope;
      this.legacyBitMap.setComponent(bitMapEntry.id, bitMapEntry);
    } else if (sourceId.scope !== targetId.scope) {
      this.setDefaultScope(sourceId, targetId.scope);
    }
  }

  /**
   * helpful when reaming an aspect and this aspect is used in the config of other components.
   */
  renameAspectInConfig(sourceId: ComponentID, targetId: ComponentID) {
    this.legacyBitMap.components.forEach((componentMap) => {
      const config = componentMap.config;
      if (!config) return;
      Object.keys(config).forEach((aspectId) => {
        if (aspectId === sourceId.toString()) {
          config[targetId.toString()] = config[aspectId];
          delete config[aspectId];
          this.markAsChanged();
        }
        if (aspectId === EnvsAspect.id) {
          const envConfig = config[aspectId];
          if (envConfig !== '-' && envConfig.env === sourceId.toString()) {
            envConfig.env = targetId.toString();
            this.markAsChanged();
          }
        }
      });
      componentMap.config = config;
    });
  }

  removeComponent(id: ComponentID) {
    this.legacyBitMap.removeComponent(id);
  }

  /**
   * this is the lane-id of the recently exported lane. in case of a new lane, which was not exported yet, this will be
   * empty.
   */
  getExportedLaneId(): LaneId | undefined {
    return this.legacyBitMap.isLaneExported ? this.legacyBitMap.laneId : undefined;
  }

  makeComponentsAvailableOnMain(ids: ComponentID[]) {
    ids.forEach((id) => {
      const componentMap = this.getBitmapEntry(id);
      componentMap.isAvailableOnCurrentLane = true;
      delete componentMap.onLanesOnly;
    });
    this.legacyBitMap.markAsChanged();
  }

  /**
   * whether .bitmap file has changed in-memory
   */
  hasChanged(): boolean {
    return this.legacyBitMap.hasChanged;
  }

  takeSnapshot(): ComponentMap[] {
    return this.legacyBitMap.components.map((comp) => comp.clone());
  }

  restoreFromSnapshot(componentMaps: ComponentMap[]) {
    this.legacyBitMap.components = componentMaps;
    this.legacyBitMap._invalidateCache();
  }

  /**
   * .bitmap file could be changed by other sources (e.g. manually or by "git pull") not only by bit.
   * this method returns the timestamp when the .bitmap has changed through bit. (e.g. as part of snap/tag/export/merge
   * process)
   */
  async getLastModifiedBitmapThroughBit(): Promise<number | undefined> {
    const bitmapHistoryDir = this.consumer.getBitmapHistoryDir();
    const stat = await getPathStatIfExist(bitmapHistoryDir);
    if (!stat) return undefined;
    return stat.mtimeMs;
  }
}
