/* eslint-disable max-classes-per-file */
import R, { forEachObjIndexed } from 'ramda';
import { compact } from 'ramda-adjunct';
import { BitId, BitIds } from '../../bit-id';
import { AbstractVinyl } from '../component/sources';
import { Artifact } from '../component/sources/artifact';
import Source from '../../scope/models/source';
import { sortObject } from '../../utils';

const mergeReducer = (accumulator, currentValue) => R.unionWith(ignoreVersionPredicate, accumulator, currentValue);
type ConfigOnlyEntry = {
  id: string;
  config: Record<string, any>;
};

export class ExtensionDataEntry {
  constructor(
    public legacyId?: string,
    public extensionId?: BitId,
    public name?: string,
    public config: { [key: string]: any } = {},
    public data: { [key: string]: any } = {},
    // TODO: rename to files and make sure it only includes abstract vinyl
    public artifacts: Array<AbstractVinyl | { relativePath: string; file: Source }> = []
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

  clone(): ExtensionDataEntry {
    const clonedArtifacts = this.artifacts.map((artifact) => {
      return artifact instanceof Artifact ? artifact.clone() : artifact;
    });
    return new ExtensionDataEntry(
      this.legacyId,
      this.extensionId?.clone(),
      this.name,
      R.clone(this.config),
      R.clone(this.data),
      clonedArtifacts
    );
  }
}

export class ExtensionDataList extends Array<ExtensionDataEntry> {
  static coreExtensionsNames: Map<string, string> = new Map();
  static registerCoreExtensionName(name: string) {
    ExtensionDataList.coreExtensionsNames.set(name, '');
  }
  static registerManyCoreExtensionNames(names: string[]) {
    names.forEach((name) => {
      ExtensionDataList.coreExtensionsNames.set(name, '');
    });
  }

  get ids(): string[] {
    const list = this.map((entry) => entry.stringId);
    return list;
  }

  /**
   * returns only new 3rd party extension ids, not core, nor legacy.
   */
  get extensionsBitIds(): BitIds {
    const bitIds = this.filter((entry) => entry.extensionId).map((entry) => entry.extensionId) as BitId[];
    return BitIds.fromArray(bitIds);
  }

  findExtension(extensionId: string, ignoreVersion = false, ignoreScope = false): ExtensionDataEntry | undefined {
    if (ExtensionDataList.coreExtensionsNames.has(extensionId)) {
      return this.findCoreExtension(extensionId);
    }
    return this.find((extEntry) => {
      if (ignoreVersion && ignoreScope) {
        return extEntry.extensionId?.toStringWithoutScopeAndVersion() === extensionId;
      }
      if (ignoreVersion) {
        return extEntry.extensionId?.toStringWithoutVersion() === extensionId;
      }
      if (ignoreScope) {
        return extEntry.extensionId?.toStringWithoutScope() === extensionId;
      }
      return extEntry.stringId === extensionId;
    });
  }

  findCoreExtension(extensionId: string): ExtensionDataEntry | undefined {
    return this.find((extEntry) => extEntry.name === extensionId);
  }

  remove(id: BitId) {
    return ExtensionDataList.fromArray(
      this.filter((entry) => {
        return entry.stringId !== id.toString() && entry.stringId !== id.toStringWithoutVersion();
      })
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

  clone(): ExtensionDataList {
    const extensionDataEntries = this.map((extensionData) => extensionData.clone());
    return new ExtensionDataList(...extensionDataEntries);
  }

  _filterLegacy(): ExtensionDataList {
    return ExtensionDataList.fromArray(this.filter((ext) => !ext.isLegacy));
  }

  sortById(): ExtensionDataList {
    const arr = R.sortBy(R.prop('stringId'), this);
    // Also sort the config
    arr.forEach((entry) => {
      entry.config = sortObject(entry.config);
    });
    return ExtensionDataList.fromArray(arr);
  }

  static fromConfigObject(obj: { [extensionId: string]: any }): ExtensionDataList {
    const arr: ExtensionDataEntry[] = [];
    forEachObjIndexed((config, id) => {
      const isCore = ExtensionDataList.coreExtensionsNames.has(id);
      let entry;
      if (!isCore) {
        const parsedId = BitId.parse(id, true);
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

  /**
   * Merge a list of ExtensionDataList into one ExtensionDataList
   * In case of entry with the same id appear in more than one list
   * the former in the list will be taken
   * see unit tests for examples
   *
   * Make sure you extension ids are resolved before call this, otherwise you might get unexpected results
   * for example:
   * you might have 2 entries like: default-scope/my-extension and my-extension on the same time
   *
   * @static
   * @param {ExtensionDataList[]} list
   * @returns {ExtensionDataList}
   * @memberof ExtensionDataList
   */
  static mergeConfigs(list: ExtensionDataList[]): ExtensionDataList {
    if (list.length === 1) {
      return list[0];
    }

    const merged = list.reduce(mergeReducer, new ExtensionDataList());
    return ExtensionDataList.fromArray(merged);
  }
}

function ignoreVersionPredicate(extensionEntry1: ExtensionDataEntry, extensionEntry2: ExtensionDataEntry) {
  if (extensionEntry1.extensionId && extensionEntry2.extensionId) {
    return extensionEntry1.extensionId.isEqualWithoutVersion(extensionEntry2.extensionId);
  }
  if (extensionEntry1.name && extensionEntry2.name) {
    return extensionEntry1.name === extensionEntry2.name;
  }
  return false;
}
