import { cloneDeep, isObject } from 'lodash';
import { ComponentID } from '@teambit/component-id';

type ExtensionConfig = { [extName: string]: any } | RemoveExtensionSpecialSign | IgnoreFromSpecificSpecialSign;

export const REMOVE_EXTENSION_SPECIAL_SIGN = '-';
export const IGNORE_FROM_SPECIFIC_SPECIAL_SIGN = '--';

type RemoveExtensionSpecialSign = '-';
type IgnoreFromSpecificSpecialSign = '--';

export class ExtensionDataEntry {
  constructor(
    public legacyId?: string,
    public extensionId?: ComponentID,
    public name?: string,
    public rawConfig: ExtensionConfig = {},
    public data: { [key: string]: any } = {},
    /**
     * @deprecated use extensionId instead (it's the same)
     */
    public newExtensionId?: ComponentID
  ) {}

  get id(): string | ComponentID {
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

  get config(): { [key: string]: any } | string {
    if (this.rawConfig === REMOVE_EXTENSION_SPECIAL_SIGN) return {};
    return this.rawConfig;
  }

  set config(val: { [key: string]: any }) {
    this.rawConfig = val;
  }

  get isLegacy(): boolean {
    if (isObject(this.config) && this.config?.__legacy) return true;
    return false;
  }

  get isRemoved(): boolean {
    return this.rawConfig === REMOVE_EXTENSION_SPECIAL_SIGN;
  }

  get isIgnoredFromSpecific(): boolean {
    return this.rawConfig === IGNORE_FROM_SPECIFIC_SPECIAL_SIGN;
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
      cloneDeep(this.rawConfig),
      cloneDeep(this.data)
    );
  }
}
