import { ExtensionDataEntry } from '@teambit/legacy/dist/consumer/config/extension-data';
import { ComponentID } from '@teambit/component-id';

export type Serializable = {
  toString(): string;
};

export type SerializableMap = {
  [key: string]: Serializable;
};

export type AspectData = {
  [key: string]: any;
};

export class AspectEntry {
  constructor(public id: ComponentID, private legacyEntry: ExtensionDataEntry) {}

  get legacy() {
    return this.legacyEntry;
  }

  get isLegacy(): boolean {
    if (this.legacy.config?.__legacy) return true;
    return false;
  }

  get config() {
    return this.legacy.config;
  }

  get data() {
    return this.legacy.data;
  }

  set data(val: Record<string, any>) {
    this.legacy.data = val;
  }

  transform(newData: SerializableMap): AspectEntry {
    const newEntry = this.clone();
    newEntry.data = newData;
    return new AspectEntry(this.id, newEntry.legacy);
  }

  clone(): AspectEntry {
    return new AspectEntry(this.id, this.legacyEntry.clone());
  }

  serialize() {
    return {
      id: this.id.toString(),
      config: this.config,
      data: this.data,
      icon: 'https://static.bit.dev/extensions-icons/default.svg', // TODO @gilad - once you connect the icon here please use this url as the default icon
    };
  }
}
