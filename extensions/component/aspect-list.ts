import R from 'ramda';
import { ExtensionDataList, ExtensionDataEntry } from 'bit-bin/dist/consumer/config/extension-data';

import { ComponentID } from './id';
import { AspectEntry } from './aspect-entry';

export class AspectList {
  constructor(private legacyDataList: ExtensionDataList) {}

  private _entries: AspectEntry[] = [];

  get entries(): AspectEntry[] {
    if (this._entries.length) return this._entries;
    const newEntries = this.legacyDataList.map((entry) => {
      return new AspectEntry(this.getAspectId(entry), entry);
    });

    this._entries = newEntries;
    return newEntries;
  }

  isCoreAspect(entry: ExtensionDataEntry) {
    return !entry.extensionId && entry.name;
  }

  private getAspectId(entry: ExtensionDataEntry) {
    if (this.isCoreAspect(entry) && entry.name) return ComponentID.fromString(entry.name);
    if (entry.extensionId) return ComponentID.fromLegacy(entry.extensionId);
    throw new Error('aspect cannot be loaded without setting an ID');
  }

  get ids(): string[] {
    const list = this.entries.map((entry) => entry.id.toString());
    return list;
  }

  find(id: ComponentID, ignoreVersion = false): AspectEntry | undefined {
    return this.entries.find((aspectEntry) => {
      return id.isEqual(aspectEntry.id, { ignoreVersion });
    });
  }

  toConfigObject() {
    const res = {};
    this.entries.forEach((entry) => {
      if (entry.config && !R.isEmpty(entry.config)) {
        res[entry.id.toString()] = entry.config;
      }
    });
    return res;
  }

  toLegacy(): ExtensionDataList {
    const legacyEntries = this.entries.map((entry) => entry.legacy);
    return ExtensionDataList.fromArray(legacyEntries);
  }

  stringIds(): string[] {
    const ids = this.entries.map((entry) => entry.id.toString());
    return ids;
  }
}
