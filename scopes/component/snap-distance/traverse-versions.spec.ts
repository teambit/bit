import { expect } from 'chai';
import { Ref } from '@teambit/objects';
import type { VersionParents } from '@teambit/objects';
import {
  getAllVersionHashes,
  getAllVersionParents,
  getAllVersionsInfo,
  getSubsetOfVersionParents,
} from './traverse-versions';

/** a 40-char hash from a number. */
const hash = (i: number) => i.toString(16).padStart(40, '0');
const ref = (i: number) => new Ref(hash(i));
const item = (i: number, parents: number[] = i > 0 ? [i - 1] : []): VersionParents => ({
  hash: ref(i),
  parents: parents.map(ref),
});
/** a linear history: 0 <- 1 <- ... <- size-1 */
const linearHistory = (size: number) => Array.from({ length: size }, (_, i) => item(i));

type PopulateResult = { err?: Error; added?: VersionParents[] };

type VersionHistoryLike = { versions: VersionParents[] };

/**
 * a model-component with this version-history, and what populating it returns per head (default: no error) — it
 * gets the version-history, so it can add to it as the real one does.
 */
function fakeModelComponent(
  versions: VersionParents[],
  populate: (head: Ref, versionHistory: VersionHistoryLike) => PopulateResult = () => ({}),
  head?: Ref
): any {
  const versionHistory: VersionHistoryLike = { versions };
  return {
    id: () => 'acme.ui/button',
    getHeadRegardlessOfLane: () => head,
    getVersionHistory: async () => versionHistory,
    populateVersionHistoryIfMissingGracefully: async (_repo: any, vh: VersionHistoryLike, current: Ref) =>
      populate(current, vh),
  };
}

/**
 * two branches from 1, merged at 6:
 *   0 <- 1 <- 2 <- 3 <------ 6 <- 7
 *         \- 4 <- 5 <------/
 */
const mergedHistory = () => [
  item(0),
  item(1),
  item(2, [1]),
  item(3, [2]),
  item(4, [1]),
  item(5, [4]),
  item(6, [3, 5]),
  item(7, [6]),
];

const hashes = (list: VersionParents[]) => list.map((v) => v.hash.toString());

describe('getAllVersionParents', () => {
  it('lists each version once, in the order first seen — also for multiple heads', async () => {
    const versions = linearHistory(5);
    const result = await getAllVersionParents({
      repo: {} as any,
      modelComponent: fakeModelComponent(versions),
      heads: [ref(4), ref(2)],
    });
    expect(hashes(result)).to.deep.equal(hashes(versions));
  });

  it('overrides an existing version with a later duplicate, keeping its position', async () => {
    // the client sends version 2 with other parents than the scope's history has
    const result = await getAllVersionParents({
      repo: {} as any,
      modelComponent: fakeModelComponent(linearHistory(3)),
      heads: [ref(2)],
      versionParentsFromObjects: [item(2, [0])],
    });
    expect(hashes(result)).to.deep.equal([hash(0), hash(1), hash(2)]);
    expect(result[2].parents.map(String)).to.deep.equal([hash(0)]);
  });

  it('adds the versions the history populated when populating partly failed', async () => {
    const result = await getAllVersionParents({
      repo: {} as any,
      modelComponent: fakeModelComponent([], () => ({ err: new Error('missing'), added: [item(0), item(1), item(0)] })),
      heads: [ref(1)],
    });
    expect(hashes(result)).to.deep.equal([hash(0), hash(1)]);
  });

  it('throws the populate error when asked to', async () => {
    const promise = getAllVersionParents({
      repo: {} as any,
      modelComponent: fakeModelComponent([], () => ({ err: new Error('missing version') })),
      heads: [ref(1)],
      throws: true,
    });
    const error = await promise.then(
      () => undefined,
      (err: Error) => err
    );
    expect(error?.message).to.equal('missing version');
  });

  it('adds the versions sent from the client, when their parents are known', async () => {
    const result = await getAllVersionParents({
      repo: {} as any,
      modelComponent: fakeModelComponent(linearHistory(3)),
      heads: [ref(2)],
      versionParentsFromObjects: [item(3, [2])],
    });
    expect(hashes(result)).to.deep.equal([hash(0), hash(1), hash(2), hash(3)]);
  });

  it('retries with the missing parents as heads, and throws when they are still missing', async () => {
    const populatedHeads: string[] = [];
    const promise = getAllVersionParents({
      repo: {} as any,
      modelComponent: fakeModelComponent(linearHistory(3), (head) => {
        populatedHeads.push(head.toString());
        return {};
      }),
      heads: [ref(2)],
      versionParentsFromObjects: [item(10, [9])],
    });
    const error = await promise.then(
      () => undefined,
      (err: Error) => err
    );
    expect(error?.message).to.include('unable to get the full history of "acme.ui/button"');
    expect(error?.message).to.include(`missing snaps: ${hash(9)}`);
    // the first run with the head, the retry with the head and the missing parent
    expect(populatedHeads).to.deep.equal([hash(2), hash(2), hash(9)]);
  });

  it('stays fast for a long history and two heads — the dedupe is not quadratic', async () => {
    const size = 20000;
    const versions = linearHistory(size);
    const start = Date.now();
    const result = await getAllVersionParents({
      repo: {} as any,
      modelComponent: fakeModelComponent(versions),
      heads: [ref(size - 1), ref(size - 2)],
    });
    expect(result).to.have.length(size);
    expect(Date.now() - start).to.be.lessThan(2000);
  });
});

describe('getAllVersionParents — more cases', () => {
  it('returns nothing for an empty history and no heads', async () => {
    const result = await getAllVersionParents({ repo: {} as any, modelComponent: fakeModelComponent([]), heads: [] });
    expect(result).to.deep.equal([]);
  });

  it('lists a merged history once, keeping the merge snap parents', async () => {
    const result = await getAllVersionParents({
      repo: {} as any,
      modelComponent: fakeModelComponent(mergedHistory()),
      heads: [ref(7), ref(5)],
    });
    expect(hashes(result)).to.deep.equal(hashes(mergedHistory()));
    expect(result.find((v) => v.hash.toString() === hash(6))!.parents.map(String)).to.deep.equal([hash(3), hash(5)]);
  });

  it('does not duplicate when the same head is passed twice', async () => {
    const result = await getAllVersionParents({
      repo: {} as any,
      modelComponent: fakeModelComponent(linearHistory(4)),
      heads: [ref(3), ref(3)],
    });
    expect(hashes(result)).to.deep.equal(hashes(linearHistory(4)));
  });

  it('populates the history once per head, in order', async () => {
    const populated: string[] = [];
    await getAllVersionParents({
      repo: {} as any,
      modelComponent: fakeModelComponent(linearHistory(5), (head) => {
        populated.push(head.toString());
        return {};
      }),
      heads: [ref(4), ref(1), ref(2)],
    });
    expect(populated).to.deep.equal([hash(4), hash(1), hash(2)]);
  });

  it('overrides the existing entry in place — the same object, with the new field values', async () => {
    const versions = linearHistory(3);
    const result = await getAllVersionParents({
      repo: {} as any,
      modelComponent: fakeModelComponent(versions),
      heads: [ref(2)],
      versionParentsFromObjects: [item(2, [0])],
    });
    expect(result[2]).to.equal(versions[2]);
    expect(versions[2].parents.map(String)).to.deep.equal([hash(0)]);
  });

  it('overrides only the fields the existing entry has', async () => {
    const withUnrelated = { ...item(1, [0]), unrelated: undefined } as VersionParents;
    const versions = [item(0), withUnrelated, item(2)];
    const result = await getAllVersionParents({
      repo: {} as any,
      modelComponent: fakeModelComponent(versions),
      heads: [ref(2)],
      versionParentsFromObjects: [
        { ...item(1, [0]), unrelated: ref(90) } as VersionParents,
        { ...item(2, [1]), unrelated: ref(91) } as VersionParents,
      ],
    });
    // version 1 has an `unrelated` field to override; version 2 doesn't, so the sent value isn't added
    expect(result[1].unrelated?.toString()).to.equal(hash(90));
    expect(result[2]).to.not.have.property('unrelated');
  });

  it('appends the versions sent from the client after the history, in their order, once each', async () => {
    const result = await getAllVersionParents({
      repo: {} as any,
      modelComponent: fakeModelComponent(linearHistory(2)),
      heads: [ref(1)],
      versionParentsFromObjects: [item(3, [2]), item(2, [1]), item(3, [2])],
    });
    expect(hashes(result)).to.deep.equal([hash(0), hash(1), hash(3), hash(2)]);
  });

  it('does not retry when the parents of the sent versions are known', async () => {
    const populated: string[] = [];
    await getAllVersionParents({
      repo: {} as any,
      modelComponent: fakeModelComponent(linearHistory(3), (head) => {
        populated.push(head.toString());
        return {};
      }),
      heads: [ref(2)],
      versionParentsFromObjects: [item(3, [2])],
    });
    expect(populated).to.deep.equal([hash(2)]);
  });

  it('succeeds on the retry when populating the missing parent adds it to the history', async () => {
    const result = await getAllVersionParents({
      repo: {} as any,
      modelComponent: fakeModelComponent(linearHistory(3), (head, versionHistory) => {
        if (head.toString() === hash(9) && !versionHistory.versions.some((v) => v.hash.toString() === hash(9))) {
          versionHistory.versions.push(item(9, [2]));
        }
        return {};
      }),
      heads: [ref(2)],
      versionParentsFromObjects: [item(10, [9])],
    });
    expect(hashes(result)).to.deep.equal([hash(0), hash(1), hash(2), hash(9), hash(10)]);
  });

  it('skips a head whose populating failed with nothing added, and keeps the others', async () => {
    const result = await getAllVersionParents({
      repo: {} as any,
      modelComponent: fakeModelComponent(linearHistory(3), (head) =>
        head.toString() === hash(7) ? { err: new Error('missing') } : {}
      ),
      heads: [ref(7), ref(2)],
    });
    expect(hashes(result)).to.deep.equal([hash(0), hash(1), hash(2)]);
  });

  it('combines the added versions of a failed head with the history of another head', async () => {
    const result = await getAllVersionParents({
      repo: {} as any,
      modelComponent: fakeModelComponent(linearHistory(2), (head) =>
        head.toString() === hash(8) ? { err: new Error('partial'), added: [item(8, [7]), item(1, [0])] } : {}
      ),
      heads: [ref(8), ref(1)],
    });
    expect(hashes(result)).to.deep.equal([hash(8), hash(1), hash(0)]);
  });

  it('stays fast for a long history with merges', async () => {
    // every 10th snap merges a side snap: thousands of two-parent snaps
    const size = 20000;
    const versions = Array.from({ length: size }, (_, i) => {
      if (i === 0) return item(0);
      const mainParent = i - 1;
      return i % 10 === 0 ? item(i, [mainParent, size + i]) : item(i, [mainParent]);
    }).concat(Array.from({ length: size / 10 }, (_, j) => item(size + (j + 1) * 10, [(j + 1) * 10 - 2])));
    const start = Date.now();
    const result = await getAllVersionParents({
      repo: {} as any,
      modelComponent: fakeModelComponent(versions),
      heads: [ref(size - 1), ref(size - 5)],
    });
    expect(result).to.have.length(versions.length);
    expect(Date.now() - start).to.be.lessThan(2000);
  });

  it('stays fast when the client sends thousands of versions that are already in the history', async () => {
    const size = 20000;
    const versions = linearHistory(size);
    const start = Date.now();
    const result = await getAllVersionParents({
      repo: {} as any,
      modelComponent: fakeModelComponent(versions),
      heads: [ref(size - 1)],
      versionParentsFromObjects: linearHistory(size),
    });
    expect(result).to.have.length(size);
    expect(Date.now() - start).to.be.lessThan(2000);
  });
});

describe('getSubsetOfVersionParents', () => {
  it('walks from a snap through its parents — not the snaps after it', () => {
    const result = getSubsetOfVersionParents(linearHistory(5), ref(2));
    expect(hashes(result)).to.deep.equal([hash(2), hash(1), hash(0)]);
  });

  it('walks both parents of a merge, the shared ancestors once', () => {
    const result = getSubsetOfVersionParents(mergedHistory(), ref(7));
    expect(hashes(result).sort()).to.deep.equal(hashes(mergedHistory()).sort());
    expect(new Set(hashes(result)).size).to.equal(result.length);
  });

  it('leaves out a branch the snap does not descend from', () => {
    const result = getSubsetOfVersionParents(mergedHistory(), ref(5));
    expect(hashes(result)).to.deep.equal([hash(5), hash(4), hash(1), hash(0)]);
  });

  it('stops at the given snaps, leaving them out', () => {
    const result = getSubsetOfVersionParents(linearHistory(5), ref(4), [ref(1)]);
    expect(hashes(result)).to.deep.equal([hash(4), hash(3), hash(2)]);
  });

  it('is empty when the snap is not in the list, or is a stop snap', () => {
    expect(getSubsetOfVersionParents(linearHistory(3), ref(9))).to.deep.equal([]);
    expect(getSubsetOfVersionParents(linearHistory(3), ref(2), [ref(2)])).to.deep.equal([]);
  });

  it('skips a parent that is not in the list', () => {
    const result = getSubsetOfVersionParents([item(1, [0]), item(2, [1])], ref(2));
    expect(hashes(result)).to.deep.equal([hash(2), hash(1)]);
  });

  it('uses the first entry of a hash listed twice', () => {
    const first = item(1, [0]);
    const second = item(1, []);
    const result = getSubsetOfVersionParents([item(0), first, second, item(2, [1])], ref(2));
    expect(result[1]).to.equal(first);
    expect(hashes(result)).to.deep.equal([hash(2), hash(1), hash(0)]);
  });

  it('stays fast walking a long history', () => {
    const size = 20000;
    const start = Date.now();
    const result = getSubsetOfVersionParents(linearHistory(size), ref(size - 1), [ref(0)]);
    expect(result).to.have.length(size - 1);
    expect(Date.now() - start).to.be.lessThan(2000);
  });
});

describe('getAllVersionHashes', () => {
  it('lists the hashes from the head down, by default', async () => {
    const result = await getAllVersionHashes({
      repo: {} as any,
      modelComponent: fakeModelComponent(linearHistory(4), undefined, ref(3)),
    });
    expect(result.map(String)).to.deep.equal([hash(3), hash(2), hash(1), hash(0)]);
  });

  it('starts from the given snap, and stops at the given snaps', async () => {
    const result = await getAllVersionHashes({
      repo: {} as any,
      modelComponent: fakeModelComponent(linearHistory(6), undefined, ref(5)),
      startFrom: ref(4),
      stopAt: [ref(1)],
    });
    expect(result.map(String)).to.deep.equal([hash(4), hash(3), hash(2)]);
  });

  it('is empty when there is no head, or startFrom is null', async () => {
    const noHead = await getAllVersionHashes({ repo: {} as any, modelComponent: fakeModelComponent(linearHistory(3)) });
    const nullStart = await getAllVersionHashes({
      repo: {} as any,
      modelComponent: fakeModelComponent(linearHistory(3), undefined, ref(2)),
      startFrom: null,
    });
    expect(noHead).to.deep.equal([]);
    expect(nullStart).to.deep.equal([]);
  });

  it('stays fast for a long history — the walk is not quadratic either', async () => {
    const size = 20000;
    const start = Date.now();
    const result = await getAllVersionHashes({
      repo: {} as any,
      modelComponent: fakeModelComponent(linearHistory(size), undefined, ref(size - 1)),
    });
    expect(result).to.have.length(size);
    expect(Date.now() - start).to.be.lessThan(2000);
  });

  it('includes the versions sent from the client', async () => {
    const result = await getAllVersionHashes({
      repo: {} as any,
      modelComponent: fakeModelComponent(linearHistory(2), undefined, ref(1)),
      versionParentsFromObjects: [item(2, [1])],
      startFrom: ref(2),
    });
    expect(result.map(String)).to.deep.equal([hash(2), hash(1), hash(0)]);
  });
});

describe('getAllVersionsInfo with version objects', () => {
  /** a version object of the given number, as the walk reads it. */
  const versionObject = (i: number, parents: number[] = i > 0 ? [i - 1] : []): any => ({
    _hash: hash(i),
    hash: () => ref(i),
    parents: parents.map(ref),
  });
  const fakeComponentWithHead = (head: number): any => ({
    id: () => 'acme.ui/button',
    getHeadRegardlessOfLane: () => ref(head),
    getHead: () => ref(head),
    getTagOfRefIfExists: () => undefined,
  });
  const refs = (list: Array<{ ref: Ref }>) => list.map((v) => v.ref.toString());

  it('returns nothing for a component without a head, without hashing the version objects', async () => {
    const counter = { hashCalls: 0 };
    const versionObjects = Array.from({ length: 1000 }, (_, i) => ({
      ...versionObject(i),
      hash: () => {
        counter.hashCalls += 1;
        return ref(i);
      },
    }));
    const headless: any = {
      id: () => 'acme.ui/button',
      getHeadRegardlessOfLane: () => undefined,
      getHead: () => undefined,
      getTagOfRefIfExists: () => undefined,
    };
    const result = await getAllVersionsInfo({ modelComponent: headless, versionObjects, throws: false });
    expect(result).to.deep.equal([]);
    expect(counter.hashCalls).to.equal(0);
  });

  it('walks from the head through the parents, using the version objects', async () => {
    const versionObjects = [0, 1, 2, 3].map((i) => versionObject(i));
    const result = await getAllVersionsInfo({ modelComponent: fakeComponentWithHead(3), versionObjects });
    expect(refs(result)).to.deep.equal([hash(3), hash(2), hash(1), hash(0)]);
    expect(result.map((v) => v.version)).to.deep.equal([3, 2, 1, 0].map((i) => versionObjects[i]));
  });

  it('uses the first version object of a hash when it was sent twice', async () => {
    const first = versionObject(1, [0]);
    const second = versionObject(1, []);
    const versionObjects = [versionObject(0), first, second, versionObject(2)];
    const result = await getAllVersionsInfo({ modelComponent: fakeComponentWithHead(2), versionObjects });
    expect(result[1].version).to.equal(first);
    expect(refs(result)).to.deep.equal([hash(2), hash(1), hash(0)]);
  });

  it('stops at the stopAt snaps', async () => {
    const versionObjects = [0, 1, 2, 3].map((i) => versionObject(i));
    const result = await getAllVersionsInfo({
      modelComponent: fakeComponentWithHead(3),
      versionObjects,
      stopAt: [ref(1)],
    });
    expect(refs(result)).to.deep.equal([hash(3), hash(2)]);
  });

  it('reports a missing parent without throwing when asked to', async () => {
    const versionObjects = [versionObject(2), versionObject(3)];
    const result = await getAllVersionsInfo({
      modelComponent: fakeComponentWithHead(3),
      versionObjects,
      throws: false,
    });
    expect(refs(result)).to.deep.equal([hash(3), hash(2), hash(1)]);
    expect(result[2].error).to.be.instanceOf(Error);
  });

  it('stays fast for a long history mixed with the versions of other components', async () => {
    const size = 20000;
    // the remote merge on export passes the versions of all exported components
    const otherComponentVersions = Array.from({ length: size }, (_, i) => versionObject(size + i, []));
    const versionObjects = [...otherComponentVersions, ...Array.from({ length: size }, (_, i) => versionObject(i))];
    const start = Date.now();
    const result = await getAllVersionsInfo({
      modelComponent: fakeComponentWithHead(size - 1),
      versionObjects,
      stopAt: [ref(size + 1)],
    });
    expect(result).to.have.length(size);
    expect(Date.now() - start).to.be.lessThan(2000);
  });
});
