import { isEqual } from 'lodash';
import { ComponentID } from '@teambit/component-id';
import LegacyBitMap from '@teambit/legacy/dist/consumer/bit-map';
import { Consumer } from '@teambit/legacy/dist/consumer';
import { GetBitMapComponentOptions } from '@teambit/legacy/dist/consumer/bit-map/bit-map';
import ComponentMap from '@teambit/legacy/dist/consumer/bit-map/component-map';
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
  async addComponentConfig(aspectId: string, id: ComponentID, config?: Record<string, any>): Promise<boolean> {
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
    await this.write();
    return true; // changes have been made
  }

  /**
   * write .bitmap object to the filesystem
   */
  async write() {
    await this.consumer.writeBitMap();
  }

  getBitmapEntry(
    id: ComponentID,
    { ignoreVersion, ignoreScopeAndVersion }: GetBitMapComponentOptions = {}
  ): ComponentMap {
    return this.legacyBitMap.getComponent(id._legacy, { ignoreVersion, ignoreScopeAndVersion });
  }
}
