import { expect } from 'chai';
import Ref from '../objects/ref';
import VersionHistory from './version-history';
import type { VersionParents } from './version-history';

const hash = (i: number) => i.toString(16).padStart(40, '0');
const ref = (i: number) => new Ref(hash(i));
const item = (i: number, parents: number[] = i > 0 ? [i - 1] : []): VersionParents => ({
  hash: ref(i),
  parents: parents.map(ref),
});
const linear = (from: number, to: number) => Array.from({ length: to - from }, (_, j) => item(from + j));
const create = (versions: VersionParents[]) => VersionHistory.create('button', 'acme.ui', versions);
const hashes = (versionHistory: VersionHistory) => versionHistory.versions.map((v) => v.hash.toString());

describe('VersionHistory', () => {
  describe('merge', () => {
    it('keeps the incoming versions, then the versions only the existing history has', () => {
      const existing = create([...linear(0, 3), item(10, [2]), item(11, [10])]);
      const incoming = create(linear(0, 5));
      existing.merge(incoming);
      expect(hashes(existing)).to.deep.equal([hash(0), hash(1), hash(2), hash(3), hash(4), hash(10), hash(11)]);
    });

    it('takes the incoming data of a version both histories have', () => {
      const existing = create([item(0), item(1, [0]), item(2, [1])]);
      const incoming = create([item(0), item(1, [0]), item(2, [0])]);
      existing.merge(incoming);
      expect(existing.getVersionData(ref(2))?.parents.map(String)).to.deep.equal([hash(0)]);
    });

    it('keeps the existing history when the incoming one is empty', () => {
      const existing = create(linear(0, 3));
      existing.merge(create([]));
      expect(hashes(existing)).to.deep.equal(hashes(create(linear(0, 3))));
    });

    it('takes the incoming history when the existing one is empty', () => {
      const existing = create([]);
      existing.merge(create(linear(0, 3)));
      expect(hashes(existing)).to.deep.equal(hashes(create(linear(0, 3))));
    });

    it('stays the same when the incoming history is already part of the existing one', () => {
      const existing = create([...linear(0, 4), item(20, [3])]);
      existing.merge(create(linear(0, 4)));
      expect(hashes(existing).sort()).to.deep.equal([hash(0), hash(1), hash(2), hash(3), hash(20)].sort());
    });

    it('stays fast when the existing history has thousands of versions the incoming one does not', () => {
      const size = 20000;
      const existing = create([...linear(0, size), ...Array.from({ length: size }, (_, j) => item(size + j, [j]))]);
      const incoming = create(linear(0, size));
      const start = Date.now();
      existing.merge(incoming);
      expect(existing.versions).to.have.length(size * 2);
      expect(Date.now() - start).to.be.lessThan(2000);
    });
  });
});
