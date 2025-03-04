import { Graph, Edge, Node } from '@teambit/graph.cleargraph';
import { ComponentID } from '@teambit/component-id';
import { BitError } from '@teambit/bit-error';
import { compact, difference, uniqBy } from 'lodash';
import { getStringifyArgs } from '@teambit/legacy.utils';
import Ref from '../objects/ref';
import { BitObject } from '../objects';
import type Version from './version';
import { getVersionParentsFromVersion } from '@teambit/component.snap-distance';
import ModelComponent from './model-component';

export type VersionParents = {
  hash: Ref;
  parents: Ref[];
  unrelated?: Ref;
  squashed?: Ref[];
};

export type VersionHistoryGraph = Graph<string | HashMetadata, string>;

type VersionHistoryProps = {
  name: string;
  scope: string;
  versions: VersionParents[];
  graphCompleteRefs?: string[];
};

type HashMetadata = {
  tag?: string;
  pointers?: string[];
};

export default class VersionHistory extends BitObject {
  name: string;
  scope: string;
  private versionsObj: { [hash: string]: VersionParents };
  graphCompleteRefs: string[];
  hasChanged = false; // whether the version history has changed since the last persist
  constructor(props: VersionHistoryProps) {
    super();
    this.name = props.name;
    this.scope = props.scope;
    this.versionsObj = this.versionParentsToObject(props.versions);
    this.graphCompleteRefs = props.graphCompleteRefs || [];
  }

  get versions() {
    return Object.values(this.versionsObj);
  }

  private versionParentsToObject(versions: VersionParents[]) {
    return versions.reduce((acc, version) => {
      acc[version.hash.hash] = version;
      return acc;
    }, {});
  }

  id() {
    return `${this.scope}/${this.name}:${VersionHistory.name}`;
  }

  static fromId(name: string, scope: string) {
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
      graphCompleteRefs: this.graphCompleteRefs,
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
    return this.versionsObj[ref.toString()];
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
        this.versionsObj[version.hash().hash] = versionData;
      }
    });
  }

  isEmpty() {
    return !this.versions.length;
  }

  getAllHashesFrom(start: Ref): { found?: string[]; missing?: string[] } {
    const item = this.getVersionData(start);
    if (!item) return { missing: [start.toString()] };
    const allHashes: string[] = [item.hash.toString()];
    const missing: string[] = [];
    const addHashesRecursively = (ver: VersionParents) => {
      ver.parents.forEach((parent) => {
        if (allHashes.includes(parent.toString())) return;
        const parentVer = this.getVersionData(parent);
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

  isGraphCompleteSince(ref: Ref) {
    if (this.graphCompleteRefs.includes(ref.toString())) return true;
    const { missing } = this.getAllHashesFrom(ref);
    const isComplete = !missing || !missing.length;
    if (isComplete) {
      this.graphCompleteRefs.push(ref.toString());
      this.hasChanged = true;
    }
    return isComplete;
  }

  getAllHashesAsString(): string[] {
    return Object.keys(this.versionsObj);
  }

  merge(versionHistory: VersionHistory) {
    const existingHashes = this.getAllHashesAsString();
    const incomingHashes = versionHistory.getAllHashesAsString();
    const hashesInExistingOnly = difference(existingHashes, incomingHashes);
    const versionsDataOnExistingOnly = this.versions.filter((v) => hashesInExistingOnly.includes(v.hash.toString()));
    const newVersions = [...versionHistory.versions, ...versionsDataOnExistingOnly];
    this.versionsObj = this.versionParentsToObject(newVersions);
  }

  getAncestor(numOfGenerationsToGoBack: number, ref: Ref): Ref {
    const errorMsg = `unable to get an older parent of ${this.compId.toString()}`;
    const versionData = this.getVersionData(ref);
    if (!versionData)
      throw new BitError(`${errorMsg}, version "${ref.toString()}" was not found in the version history`);
    if (numOfGenerationsToGoBack === 0) return versionData.hash;
    if (!versionData.parents.length) throw new BitError(`${errorMsg}, version "${ref.toString()}" has no parents`);
    const parent = versionData.parents[0];
    return this.getAncestor(numOfGenerationsToGoBack - 1, parent);
  }

  getGraph(
    modelComponent?: ModelComponent,
    laneHeads?: { [hash: string]: string[] },
    shortHash = false,
    limitVersions?: number
  ): VersionHistoryGraph {
    const refToStr = (ref: Ref) => (shortHash ? ref.toShortString() : ref.toString());
    const graph = new Graph<string | HashMetadata, string>();
    const allVersions = limitVersions ? [...this.versions].slice(-limitVersions) : this.versions;
    const allHashes = allVersions
      .map((v) => compact([v.hash, ...v.parents, ...(v.squashed || []), v.unrelated]))
      .flat();

    const allHashesUniq = uniqBy(allHashes, 'hash');

    const getMetadata = (ref: Ref): HashMetadata | undefined => {
      if (!modelComponent || !laneHeads) return undefined;
      const tag = modelComponent.getTagOfRefIfExists(ref);
      const pointers = laneHeads[ref.toString()];
      return { tag, pointers };
    };
    const nodes = allHashesUniq.map((v) => new Node(refToStr(v), getMetadata(v) || refToStr(v)));

    const edges = allVersions
      .map((v) => {
        const verEdges = v.parents.map((p) => new Edge(refToStr(v.hash), refToStr(p), 'parent'));
        if (v.unrelated) verEdges.push(new Edge(refToStr(v.hash), refToStr(v.unrelated), 'unrelated'));
        if (v.squashed) {
          const squashed = v.squashed.filter((s) => !v.parents.find((p) => p.isEqual(s)));
          squashed.map((p) => verEdges.push(new Edge(refToStr(v.hash), refToStr(p), 'squashed')));
        }
        return verEdges;
      })
      .flat();
    graph.setNodes(nodes);
    graph.setEdges(edges);
    return graph;
  }

  get compId() {
    return ComponentID.fromObject({ scope: this.scope, name: this.name });
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
      graphCompleteRefs: parsed.graphCompleteRefs,
    };
    return new VersionHistory(props);
  }
}

export function versionParentsToGraph(versions: VersionParents[]): Graph<string, string> {
  const refToStr = (ref: Ref) => ref.toString();
  const graph = new Graph<string, string>();
  const allHashes = uniqBy(
    versions
      .map((v) => {
        return compact([v.hash, ...v.parents, ...(v.squashed || []), v.unrelated]);
      })
      .flat(),
    'hash'
  );
  const nodes = allHashes.map((v) => new Node(refToStr(v), refToStr(v)));
  const edges = versions
    .map((v) => {
      const verEdges = v.parents.map((p) => new Edge(refToStr(v.hash), refToStr(p), 'parent'));
      if (v.unrelated) verEdges.push(new Edge(refToStr(v.hash), refToStr(v.unrelated), 'unrelated'));
      if (v.squashed) {
        const squashed = v.squashed.filter((s) => !v.parents.find((p) => p.isEqual(s)));
        squashed.map((p) => verEdges.push(new Edge(refToStr(v.hash), refToStr(p), 'squashed')));
      }
      return verEdges;
    })
    .flat();
  graph.setNodes(nodes);
  graph.setEdges(edges);
  return graph;
}
