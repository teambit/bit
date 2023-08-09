import { Graph, Edge, Node } from '@teambit/graph.cleargraph';
import { compact, difference, uniqBy } from 'lodash';
import { BitId } from '../../bit-id';
import getStringifyArgs from '../../utils/string/get-stringify-args';
import Ref from '../objects/ref';
import BitObject from '../objects/object';
import type Version from './version';
import { getVersionParentsFromVersion } from '../component-ops/traverse-versions';

export type VersionParents = {
  hash: Ref;
  parents: Ref[];
  unrelated?: Ref;
  squashed?: Ref[];
};

type VersionHistoryProps = {
  name: string;
  scope?: string;
  versions: VersionParents[];
};

export default class VersionHistory extends BitObject {
  name: string;
  scope?: string;
  versions: VersionParents[];
  constructor(props: VersionHistoryProps) {
    super();
    this.name = props.name;
    this.scope = props.scope;
    this.versions = props.versions;
  }

  id() {
    return `${this.scope}/${this.name}:${VersionHistory.name}`;
  }

  static fromId(name: string, scope?: string) {
    return new VersionHistory({ scope, name, versions: [] });
  }

  toObject(): Record<string, any> {
    return {
      name: this.name,
      scope: this.scope,
      versions: this.versions.map((v) => ({
        hash: v.hash.toString(),
        parents: v.parents.map((p) => p.toString()),
        unrelated: v.unrelated?.toString(),
        squashed: v.squashed ? v.squashed.map((p) => p.toString()) : undefined,
      })),
    };
  }

  toString(pretty: boolean): string {
    const args = getStringifyArgs(pretty);
    return JSON.stringify(this.toObject(), ...args);
  }

  toBuffer(pretty): Buffer {
    return Buffer.from(this.toString(pretty));
  }

  getVersionData(ref: Ref): VersionParents | undefined {
    return this.versions.find((v) => v.hash.isEqual(ref));
  }

  hasHash(ref: Ref) {
    return Boolean(this.getVersionData(ref));
  }

  addFromVersionsObjects(versions: Version[]) {
    versions.forEach((version) => {
      const exists = this.getVersionData(version.hash());
      if (exists) {
        // just in case the parents got updated as a result of a merge/squash
        exists.parents = version.parents;
        exists.unrelated = version.unrelated?.head;
        exists.squashed = version.squashed?.previousParents;
      } else {
        const versionData = getVersionParentsFromVersion(version);
        this.versions.push(versionData);
      }
    });
  }

  getAllHashesFrom(start: Ref): { found?: string[]; missing?: string[] } {
    const item = this.versions.find((ver) => ver.hash.isEqual(start));
    if (!item) return { missing: [start.toString()] };
    const allHashes: string[] = [item.hash.toString()];
    const missing: string[] = [];
    const addHashesRecursively = (ver: VersionParents) => {
      ver.parents.forEach((parent) => {
        if (allHashes.includes(parent.toString())) return;
        const parentVer = this.versions.find((verItem) => verItem.hash.isEqual(parent));
        if (!parentVer) {
          missing.push(parent.toString());
          return;
        }
        allHashes.push(parent.toString());
        if (parentVer.parents.length) addHashesRecursively(parentVer);
      });
    };
    addHashesRecursively(item);
    return { found: allHashes, missing };
  }

  isRefPartOfHistory(startFrom: Ref, searchFor: Ref) {
    const { found } = this.getAllHashesFrom(startFrom);
    return found?.includes(searchFor.toString());
  }

  getAllHashesAsString(): string[] {
    return this.versions.map((v) => v.hash.toString());
  }

  merge(versionHistory: VersionHistory) {
    const existingHashes = this.getAllHashesAsString();
    const incomingHashes = versionHistory.getAllHashesAsString();
    const hashesInExistingOnly = difference(existingHashes, incomingHashes);
    const versionsDataOnExistingOnly = this.versions.filter((v) => hashesInExistingOnly.includes(v.hash.toString()));
    const newVersions = [...versionHistory.versions, ...versionsDataOnExistingOnly];
    this.versions = newVersions;
  }

  getGraph() {
    const graph = new Graph<Ref, string>();
    const allHashes = uniqBy(
      this.versions
        .map((v) => {
          return compact([v.hash, ...v.parents, ...(v.squashed || []), v.unrelated]);
        })
        .flat(),
      'hash'
    );
    const nodes = allHashes.map((v) => new Node(v.toString(), v));
    const edges = this.versions
      .map((v) => {
        const verEdges = v.parents.map((p) => new Edge(v.hash.toString(), p.toString(), 'parent'));
        if (v.unrelated) verEdges.push(new Edge(v.hash.toString(), v.unrelated.toString(), 'unrelated'));
        if (v.squashed) v.squashed.map((p) => verEdges.push(new Edge(v.hash.toString(), p.toString(), 'squashed')));
        return verEdges;
      })
      .flat();
    graph.setNodes(nodes);
    graph.setEdges(edges);
    return graph;
  }

  get bitId() {
    return new BitId({ scope: this.scope, name: this.name });
  }

  static create(name: string, scope: string, versions: VersionParents[]) {
    return new VersionHistory({
      name,
      scope,
      versions,
    });
  }

  static parse(contents: string): VersionHistory {
    const parsed = JSON.parse(contents);
    const props: VersionHistoryProps = {
      name: parsed.name,
      scope: parsed.scope,
      versions: parsed.versions.map((ver) => ({
        hash: Ref.from(ver.hash),
        parents: ver.parents.map((p) => Ref.from(p)),
        unrelated: ver.unrelated ? Ref.from(ver.unrelated) : undefined,
        squashed: ver.squashed ? ver.squashed.map((p) => Ref.from(p)) : undefined,
      })),
    };
    return new VersionHistory(props);
  }
}
