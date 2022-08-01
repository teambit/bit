import { sha1 } from '@teambit/legacy/dist/utils';
import { uniqWith, sortBy } from 'lodash';
import { SemverVersion } from '../policy';

export type EnvPolicyEntryVersion = SemverVersion;
export type EnvPolicyEntrySupportedRange = SemverVersion;

export type PeersAutoDetectPolicyEntry = {
  name: string;
  version: string;
  supportedRange: string;
};

export class PeersAutoDetectPolicy {
  constructor(private _policiesEntries: PeersAutoDetectPolicyEntry[]) {
    this._policiesEntries = uniqEntries(_policiesEntries);
  }

  get entries(): PeersAutoDetectPolicyEntry[] {
    return this._policiesEntries;
  }

  get length(): number {
    return this.entries.length;
  }

  get names(): string[] {
    return this.entries.map((e) => e.name);
  }

  find(name: string): PeersAutoDetectPolicyEntry | undefined {
    const matchedEntry = this.entries.find((entry) => entry.name === name);
    return matchedEntry;
  }

  sortByName(): PeersAutoDetectPolicy {
    const sorted = sortBy(this.entries, ['name']);
    return new PeersAutoDetectPolicy(sorted);
  }

  /**
   * Return a hash of all the peers names and their version
   * This useful when you want to compare 2 envs
   */
  hashNameVersion(): string {
    const sorted = this.sortByName();
    const toHash = sorted.entries.map(({ name, version }) => `${name}::${version}`).join(':::');
    return sha1(toHash);
  }

  filter(predicate: (dep: PeersAutoDetectPolicyEntry, index?: number) => boolean): PeersAutoDetectPolicy {
    const filtered = this.entries.filter(predicate);
    return new PeersAutoDetectPolicy(filtered);
  }

  getDepVersion(depId: string): EnvPolicyEntryVersion | undefined {
    const entry = this.find(depId);
    if (!entry) {
      return undefined;
    }
    return entry.version;
  }

  getDepSupportedRange(depId: string): EnvPolicyEntrySupportedRange | undefined {
    const entry = this.find(depId);
    if (!entry) {
      return undefined;
    }
    return entry.supportedRange;
  }

  toNameSupportedRangeMap(): { [name: string]: string } {
    return this.entries.reduce((acc, entry) => {
      acc[entry.name] = entry.supportedRange;
      return acc;
    }, {});
  }

  toVersionManifest(): { [name: string]: string } {
    return this.entries.reduce((acc, entry) => {
      acc[entry.name] = entry.version;
      return acc;
    }, {});
  }

  static mergePolices(policies: PeersAutoDetectPolicy[]): PeersAutoDetectPolicy {
    let allEntries: PeersAutoDetectPolicyEntry[] = [];
    allEntries = policies.reduce((acc, curr) => {
      return acc.concat(curr.entries);
    }, allEntries);
    // We reverse it to make sure the latest policy will be stronger in case of conflict
    allEntries = allEntries.reverse();
    return new PeersAutoDetectPolicy(allEntries);
  }
}

function uniqEntries(entries: Array<PeersAutoDetectPolicyEntry>): Array<PeersAutoDetectPolicyEntry> {
  const uniq = uniqWith(entries, (entry1: PeersAutoDetectPolicyEntry, entry2: PeersAutoDetectPolicyEntry) => {
    return entry1.name === entry2.name;
  });
  return uniq;
}
