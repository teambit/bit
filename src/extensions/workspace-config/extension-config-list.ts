import { find } from 'ramda';
import { BitId } from '../../bit-id';

export interface ExtensionConfigEntry {
  id: string;
  config: any;
}

export class ExtensionConfigList extends Array<ExtensionConfigEntry> {
  get ids(): string[] {
    return this.map(entry => entry.id);
  }

  findExtension(extensionId: string, ignoreVersion = false): ExtensionConfigEntry | undefined {
    return find((extEntry: ExtensionConfigEntry) => {
      if (!ignoreVersion) {
        return extEntry.id === extensionId;
      }
      return BitId.getStringWithoutVersion(extEntry.id) === BitId.getStringWithoutVersion(extensionId);
    }, this);
  }

  toObject() {
    const res = {};
    this.forEach(entry => (res[entry.id] = entry.config));
    return res;
  }

  _filterLegacy(): ExtensionConfigList {
    return ExtensionConfigList.fromArray(this.filter(ext => !ext.config.__legacy));
  }

  static fromArray(entries: ExtensionConfigEntry[]): ExtensionConfigList {
    return new ExtensionConfigList(...entries);
  }
}
