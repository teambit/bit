/* eslint-disable max-classes-per-file */
import R from 'ramda';
import { compact, isEmpty, cloneDeep } from 'lodash';
import { BitId, BitIds } from '../../bit-id';
import { sortObject } from '../../utils';
import {
  convertBuildArtifactsFromModelObject,
  convertBuildArtifactsToModelObject,
  reStructureBuildArtifacts,
} from '../component/sources/artifact-files';

const mergeReducer = (accumulator, currentValue) => R.unionWith(ignoreVersionPredicate, accumulator, currentValue);
type ExtensionConfig = { [extName: string]: any } | RemoveExtensionSpecialSign;
type ConfigOnlyEntry = {
  id: string;
  config: ExtensionConfig;
};

export const REMOVE_EXTENSION_SPECIAL_SIGN = '-';
type RemoveExtensionSpecialSign = '-';

export const INTERNAL_CONFIG_FIELDS = ['__specific'];

export class ExtensionDataEntry {
  constructor(
    public legacyId?: string,
    public extensionId?: BitId,
    public name?: string,
    public rawConfig: ExtensionConfig = {},
    public data: { [key: string]: any } = {},
    public newExtensionId: any = undefined
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

  get config(): { [key: string]: any } {
    if (this.rawConfig === REMOVE_EXTENSION_SPECIAL_SIGN) return {};
    return this.rawConfig;
  }

  set config(val: { [key: string]: any }) {
    this.rawConfig = val;
  }

  get isLegacy(): boolean {
    if (this.config?.__legacy) return true;
    return false;
  }

  get isRemoved(): boolean {
    return this.rawConfig === REMOVE_EXTENSION_SPECIAL_SIGN;
  }

  toModelObject() {
    const extensionId =
      this.extensionId && this.extensionId.serialize ? this.extensionId.serialize() : this.extensionId;
    return {
      extensionId,
      // Do not use raw config here
      config: this.config,
      data: this.data,
      legacyId: this.legacyId,
      name: this.name,
      newExtensionId: this.newExtensionId,
    };
  }

  toComponentObject() {
    const extensionId = this.extensionId ? this.extensionId.toString() : this.extensionId;
    return {
      extensionId,
      // Do not use raw config here
      config: this.config,
      data: this.data,
      legacyId: this.legacyId,
      name: this.name,
      newExtensionId: this.newExtensionId,
    };
  }

  clone(): ExtensionDataEntry {
    return new ExtensionDataEntry(
      this.legacyId,
      this.extensionId?.clone(),
      this.name,
      R.clone(this.rawConfig),
      R.clone(this.data)
    );
  }

  static create(extensionId: string, config?: any, data?: any): ExtensionDataEntry {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const isCore = ExtensionDataList.coreExtensionsNames.has(extensionId);
    if (!isCore) {
      const parsedId = BitId.parse(extensionId, true);
      return new ExtensionDataEntry(undefined, parsedId, undefined, config, data);
    }
    return new ExtensionDataEntry(undefined, undefined, extensionId, config, data);
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

  toModelObjects() {
    const extensionsClone = this.clone();
    extensionsClone.forEach((ext) => {
      if (ext.extensionId) {
        // TODO: fix the types of extensions. after this it should be an object not an object id
        // @ts-ignore
        ext.extensionId = ext.extensionId.serialize();
      }
    });
    convertBuildArtifactsToModelObject(extensionsClone);

    return extensionsClone.map((ext) => ext.toModelObject());
  }

  static fromModelObject(entries: ExtensionDataEntry[]): ExtensionDataList {
    const extensionDataList = ExtensionDataList.fromArray(entries);
    convertBuildArtifactsFromModelObject(extensionDataList);
    return extensionDataList;
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
      return extEntry.stringId === extensionId || extEntry.newExtensionId?.toString() === extensionId;
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

  /**
   * Filter extension marked to be removed with the special remove sign REMOVE_EXTENSION_SPECIAL_SIGN ("-")
   */
  filterRemovedExtensions(): ExtensionDataList {
    const filtered = this.filter((entry) => {
      return !entry.isRemoved;
    });
    return ExtensionDataList.fromArray(filtered);
  }

  toConfigObject() {
    const res = {};
    this.forEach((entry) => {
      if (entry.rawConfig && !isEmpty(entry.rawConfig)) {
        res[entry.stringId] = removeInternalConfigFields(entry.rawConfig);
        if (isEmpty(res[entry.stringId])) delete res[entry.stringId];
      }
    });
    return res;
  }

  toConfigArray(): ConfigOnlyEntry[] {
    const arr = this.map((entry) => {
      // Remove extensions without config
      const clonedEntry = entry.clone();
      if (clonedEntry.rawConfig && !isEmpty(clonedEntry.rawConfig)) {
        removeInternalConfigFieldsWithMutation(clonedEntry.rawConfig);
        if (isEmpty(clonedEntry.rawConfig)) return undefined;
        return { id: clonedEntry.stringId, config: clonedEntry.config };
      }
      return undefined;
    });
    return compact(arr);
  }

  clone(): ExtensionDataList {
    const extensionDataEntries = this.map((extensionData) => extensionData.clone());
    const extensionDataList = new ExtensionDataList(...extensionDataEntries);
    reStructureBuildArtifacts(extensionDataList);
    return extensionDataList;
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

  static fromConfigObject(obj: { [extensionId: string]: any } = {}): ExtensionDataList {
    const arr = Object.keys(obj).map((extensionId) => configEntryToDataEntry(extensionId, obj[extensionId]));
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

export function configEntryToDataEntry(extensionId: string, config: any): ExtensionDataEntry {
  const isCore = ExtensionDataList.coreExtensionsNames.has(extensionId);
  if (!isCore) {
    const parsedId = BitId.parse(extensionId, true);
    return new ExtensionDataEntry(undefined, parsedId, undefined, config, undefined);
  }
  return new ExtensionDataEntry(undefined, undefined, extensionId, config, undefined);
}

export function removeInternalConfigFields(config?: ExtensionConfig): ExtensionConfig | undefined {
  if (!config || config === REMOVE_EXTENSION_SPECIAL_SIGN) return config;
  const clonedConfig = cloneDeep(config);
  INTERNAL_CONFIG_FIELDS.forEach((field) => delete clonedConfig[field]);
  return clonedConfig;
}

export function removeInternalConfigFieldsWithMutation(config?: ExtensionConfig) {
  if (!config || config === REMOVE_EXTENSION_SPECIAL_SIGN) return;
  INTERNAL_CONFIG_FIELDS.forEach((field) => delete config[field]);
}
