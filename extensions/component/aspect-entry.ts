import { ExtensionDataEntry } from 'bit-bin/dist/consumer/config/extension-data';
import Source from 'bit-bin/dist/scope/models/source';
import { AbstractVinyl } from 'bit-bin/dist/consumer/component/sources';
import { ComponentID } from './id';

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

  get artifacts() {
    return this.legacy.artifacts;
  }

  set artifacts(val: Array<AbstractVinyl | { relativePath: string; file: Source }>) {
    this.legacy.artifacts = val;
  }

  clone(): AspectEntry {
    return new AspectEntry(this.id, this.legacyEntry.clone());
  }

  static fromConfigEntry(id: ComponentID, config: Record<string, any>) {
    return new AspectEntry(id, ExtensionDataEntry.fromConfigEntry(id._legacy, config));
  }
}
