import { compact } from 'ramda-adjunct';
import R, {forEachObjIndexed} from 'ramda';
import { BitId } from 'bit-bin/dist/bit-id';
import { ExtensionDataList } from 'bit-bin/dist/consumer/config/extension-data';
import { sortObject } from 'bit-bin/dist/utils';

import { ComponentID } from './id';
import { AspectEntry } from './aspect-entry';

const mergeReducer = (accumulator, currentValue) => R.unionWith(ignoreVersionPredicate, accumulator, currentValue);
type ConfigOnlyEntry = {
  id: string;
  config: Record<string, any>;
};

type idResolveFunc = (id: string | ComponentID | BitId) => Promise<ComponentID>;

export class AspectList extends Array<AspectEntry> {
  get ids(): string[] {
    const list = this.map((entry) => entry.stringId);
    return list;
  }

  findExtension(id: ComponentID, ignoreVersion = false): AspectEntry | undefined {
    return this.find((aspectEntry) => {
      return id.isEqual(aspectEntry.id, {ignoreVersion});
    });
  }

  remove(id: ComponentID) {
    return AspectList.fromArray(
      this.filter((entry) => !entry.id.isEqual(id))
    );
  }

  toConfigObject() {
    const res = {};
    this.forEach((entry) => {
      if (entry.config && !R.isEmpty(entry.config)) {
        res[entry.stringId] = entry.config;
      }
    });
    return res;
  }

  toConfigArray(): ConfigOnlyEntry[] {
    const arr = this.map((entry) => {
      // Remove extensions without config
      if (entry.config && !R.isEmpty(entry.config)) {
        return { id: entry.stringId, config: entry.config };
      }
      return undefined;
    });
    return compact(arr);
  }

  clone(): AspectList {
    const extensionDataEntries = this.map((extensionData) => extensionData.clone());
    return new AspectList(...extensionDataEntries);
  }

  _filterLegacy(): AspectList {
    return AspectList.fromArray(this.filter((ext) => !ext.isLegacy));
  }

  sortById(): AspectList {
    const arr = R.sortBy(R.prop('stringId'), this);
    // Also sort the config
    arr.forEach((entry) => {
      entry.config = sortObject(entry.config);
    });
    return AspectList.fromArray(arr);
  }

  toLegacy(): ExtensionDataList {
    const legacyEntries = this.map(entry => entry.legacy);
    return ExtensionDataList.fromArray(legacyEntries);
  }

  stringIds(): string[] {
    const ids = this.map(entry => entry.id.toString());
    return ids;
  }

  static async fromLegacy(legacyList: ExtensionDataList, idResolver: idResolveFunc){
    const entriesP = legacyList.map(async (legacyEntry) => {
      const componentId = await idResolver(legacyEntry.id);
      const newEntry = new AspectEntry(componentId, legacyEntry);
      return newEntry;
    });
    const entries = await Promise.all(entriesP);
    return AspectList.fromArray(entries);
  }

  static fromConfigObject(obj: { [extensionId: string]: any }): AspectList {
    const arr: AspectEntry[] = [];
    forEachObjIndexed((config, id) => {
      const bitId = BitId.parse(id, true);
      const componentId = ComponentID.fromLegacy(bitId)
      let entry = AspectEntry.fromConfigEntry(componentId, config);
      arr.push(entry);
    }, obj);
    return this.fromArray(arr);
  }

  static fromArray(entries: AspectEntry[]): AspectList {
    if (!entries || !entries.length) {
      return new AspectList();
    }
    return new AspectList(...entries);
  }

  /**
   * Merge a list of AspectList into one AspectList
   * In case of entry with the same id appear in more than one list
   * the former in the list will be taken
   * see unit tests for examples
   *
   * Make sure you extension ids are resolved before call this, otherwise you might get unexpected results
   * for example:
   * you might have 2 entries like: default-scope/my-extension and my-extension on the same time
   *
   * @static
   * @param {AspectList[]} list
   * @returns {AspectList}
   * @memberof AspectList
   */
  static mergeConfigs(list: AspectList[]): AspectList {
    if (list.length === 1) {
      return list[0];
    }

    const merged = list.reduce(mergeReducer, new AspectList());
    return AspectList.fromArray(merged);
  }
}

function ignoreVersionPredicate(aspectEntry1: AspectEntry, aspectEntry2: AspectEntry) {
  return aspectEntry1.id.isEqual(aspectEntry2.id, {ignoreVersion: true});
}
