/* eslint-disable max-classes-per-file */
import { find, forEachObjIndexed } from 'ramda';
import { BitId } from '../../bit-id';
import Consumer from '../consumer';
import { ExtensionConfigList } from './extension-config-list';

export class ExtensionDataEntry {
  constructor(
    public legacyId?: string,
    public extensionId?: BitId,
    public name?: string,
    public config?: { [key: string]: any },
    public data?: { [key: string]: any }
  ) {}

  get id(): string | BitId {
    if (this.extensionId) return this.extensionId;
    if (this.name) return this.name;
    if (this.legacyId) return this.legacyId;
    return '';
  }

  get stringId(): string {
    if (this.extensionId) return this.extensionId?.toString();
    if (this.name) return this.name;
    if (this.legacyId) return this.legacyId;
    return '';
  }

  get isLegacy(): boolean {
    if (this.config?.__legacy) return true;
    return false;
  }
}

export class ExtensionDataList extends Array<ExtensionDataEntry> {
  get ids(): string[] {
    const list = this.map(entry => entry.stringId);
    return list;
  }

  findExtension(extensionId: string, ignoreVersion = false): ExtensionDataEntry | undefined {
    return find((extEntry: ExtensionDataEntry) => {
      if (!ignoreVersion) {
        return extEntry.stringId === extensionId;
      }
      return extEntry.extensionId?.toStringWithoutVersion() === extensionId;
    }, this);
  }

  findCoreExtension(extensionId: string): ExtensionDataEntry | undefined {
    return find((extEntry: ExtensionDataEntry) => {
      return extEntry.name === extensionId;
    }, this);
  }

  remove(id: BitId) {
    return ExtensionDataList.fromArray(
      this.filter(entry => {
        return entry.stringId !== id.toString() && entry.stringId !== id.toStringWithoutVersion();
      })
    );
  }

  toConfigObject() {
    const res = {};
    this.forEach(entry => (res[entry.stringId] = entry.config));
    return res;
  }

  toExtensionConfigList(): ExtensionConfigList {
    const arr = this.map(entry => {
      return {
        id: entry.stringId,
        config: entry.config
      };
    });
    return ExtensionConfigList.fromArray(arr);
  }

  _filterLegacy(): ExtensionDataList {
    return ExtensionDataList.fromArray(this.filter(ext => !ext.isLegacy));
  }

  static fromObject(obj: { [extensionId: string]: any }, consumer: Consumer): ExtensionDataList {
    const arr: ExtensionDataEntry[] = [];
    forEachObjIndexed((config, id) => {
      const parsedId = consumer.getParsedIdIfExist(id);
      let entry;
      if (parsedId) {
        entry = new ExtensionDataEntry(undefined, parsedId, undefined, config, undefined);
      } else {
        entry = new ExtensionDataEntry(undefined, undefined, id, config, undefined);
      }
      arr.push(entry);
    }, obj);
    return this.fromArray(arr);
  }

  static fromArray(entries: ExtensionDataEntry[]): ExtensionDataList {
    if (!entries || !entries.length) {
      return new ExtensionDataList();
    }
    return new ExtensionDataList(...entries);
  }
}
