import { expect } from 'chai';
import fs from 'fs-extra';
import { glob } from 'glob';
import os from 'os';
import path from 'path';
import { ComponentID } from '@teambit/component-id';
import { LaneId, DEFAULT_LANE } from '@teambit/lane-id';
import { Lane, ModelComponent, Ref, Repository, Source, Version } from '@teambit/objects';
import { Scope } from '@teambit/legacy.scope';
import { collectGarbageInWorkspace, restoreDeletedObjects } from './workspace-garbage-collector';

const SCOPE_NAME = 'my-scope';
const COMP_NAME = 'bar/foo';
const COMP_SCOPE = 'remote-scope';

const VERSION_HASHES = {
  '0.0.1': '1111111111111111111111111111111111111111',
  '0.0.2': '2222222222222222222222222222222222222222',
  '0.0.3': '3333333333333333333333333333333333333333',
};

function buildVersion(hash: string, source: Source, parents: string[]): Version {
  const contents = {
    mainFile: 'index.ts',
    files: [{ file: source.hash().toString(), relativePath: 'index.ts', name: 'index.ts', test: false }],
    log: { message: 'a snap', date: '1700000000000', username: 'tester', email: 'tester@bit.dev' },
    parents,
    dependencies: [],
    flattenedDependencies: [],
    packageDependencies: {},
    devPackageDependencies: {},
    peerPackageDependencies: {},
    extensions: [],
    bindingPrefix: '@bit',
  };
  return Version.parse(JSON.stringify(contents), hash);
}

describe('collectGarbageInWorkspace', () => {
  let scopePath: string;
  let scope: Scope;
  /** one Source per version, so it's easy to tell which version's files survived */
  let sources: { [version: string]: Source };

  const objectExists = (ref: Ref) => fs.pathExists(scope.objects.objectPath(ref));

  beforeEach(async () => {
    scopePath = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-gc-spec-'));
    scope = await Scope.ensure(scopePath, SCOPE_NAME);
    await scope.scopeJson.write();

    sources = {
      '0.0.1': Source.from(Buffer.from('the contents of version 0.0.1')),
      '0.0.2': Source.from(Buffer.from('the contents of version 0.0.2')),
      '0.0.3': Source.from(Buffer.from('the contents of version 0.0.3')),
    };
    const versions = {
      '0.0.1': buildVersion(VERSION_HASHES['0.0.1'], sources['0.0.1'], []),
      '0.0.2': buildVersion(VERSION_HASHES['0.0.2'], sources['0.0.2'], [VERSION_HASHES['0.0.1']]),
      '0.0.3': buildVersion(VERSION_HASHES['0.0.3'], sources['0.0.3'], [VERSION_HASHES['0.0.2']]),
    };
    const modelComponent = ModelComponent.from({
      name: COMP_NAME,
      scope: COMP_SCOPE,
      lang: 'javascript',
      deprecated: false,
      bindingPrefix: '@bit',
      versions: {
        '0.0.1': Ref.from(VERSION_HASHES['0.0.1']),
        '0.0.2': Ref.from(VERSION_HASHES['0.0.2']),
        '0.0.3': Ref.from(VERSION_HASHES['0.0.3']),
      },
      head: Ref.from(VERSION_HASHES['0.0.3']),
    });
    const allObjects = [modelComponent, ...Object.values(versions), ...Object.values(sources)];
    allObjects.forEach((object) => {
      object.validateBeforePersist = false;
    });
    await scope.objects.writeObjectsToTheFS(allObjects);
  });

  afterEach(async () => {
    await fs.remove(scopePath);
  });

  /**
   * the component was imported rather than created here, so its head is what the remote has. this
   * is what makes its older versions re-fetchable, and therefore deletable.
   */
  async function markAsExported() {
    await scope.objects.remoteLanes.addEntry(
      LaneId.from(DEFAULT_LANE, COMP_SCOPE),
      ComponentID.fromObject({ scope: COMP_SCOPE, name: COMP_NAME }),
      Ref.from(VERSION_HASHES['0.0.3'])
    );
    await scope.objects.remoteLanes.write();
  }

  /**
   * the collector leaves alone anything written in the last few minutes, since another process
   * may be halfway through writing a `Version` and the component that will point at it. every
   * object a test writes is brand new, so they all have to be aged first for the run to consider
   * them at all.
   *
   * only real objects are touched - a temp file's age is the subject of its own test.
   */
  async function settleObjects() {
    const objectsPath = scope.objects.getPath();
    const matches = await glob(path.join('*', '*'), { cwd: objectsPath });
    const objects = matches.filter((match) => /^[0-9a-f]{38}$/.test(path.basename(match)));
    const anHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await Promise.all(objects.map((object) => fs.utimes(path.join(objectsPath, object), anHourAgo, anHourAgo)));
  }

  /** the workspace is checked out at 0.0.2, while the component's head is 0.0.3 */
  const runGc = async (opts = {}) => {
    await settleObjects();
    return collectGarbageInWorkspace(
      scope,
      [ComponentID.fromObject({ scope: COMP_SCOPE, name: COMP_NAME }).changeVersion('0.0.2')],
      opts
    );
  };

  describe('with a component whose older version nothing points at', () => {
    beforeEach(async () => {
      await markAsExported();
    });

    it('should keep the version the workspace is checked out at, along with its files', async () => {
      await runGc();
      expect(await objectExists(Ref.from(VERSION_HASHES['0.0.2']))).to.be.true;
      expect(await objectExists(sources['0.0.2'].hash())).to.be.true;
    });
    it('should keep the head version, along with its files', async () => {
      await runGc();
      expect(await objectExists(Ref.from(VERSION_HASHES['0.0.3']))).to.be.true;
      expect(await objectExists(sources['0.0.3'].hash())).to.be.true;
    });
    it('should delete the superseded version together with its files', async () => {
      await runGc();
      expect(await objectExists(Ref.from(VERSION_HASHES['0.0.1']))).to.be.false;
      expect(await objectExists(sources['0.0.1'].hash())).to.be.false;
    });
    it('should never delete the component object itself', async () => {
      await runGc();
      const modelComponent = await scope.getModelComponentIfExist(
        ComponentID.fromObject({ scope: COMP_SCOPE, name: COMP_NAME })
      );
      expect(modelComponent).to.not.be.undefined;
    });
    it('should leave a freshly written object alone, as another process may be mid-write', async () => {
      // an import writes the Version and Source first and points the ModelComponent at them after.
      // a run that reads the components in between would see an object nothing refers to yet.
      const collectable = scope.objects.objectPath(Ref.from(VERSION_HASHES['0.0.1']));
      await settleObjects();
      const now = new Date();
      await fs.utimes(collectable, now, now);
      const result = await collectGarbageInWorkspace(
        scope,
        [ComponentID.fromObject({ scope: COMP_SCOPE, name: COMP_NAME }).changeVersion('0.0.2')],
        {}
      );
      expect(result.deletedObjects).to.equal(1); // only the Source, not the Version just touched
      expect(await objectExists(Ref.from(VERSION_HASHES['0.0.1']))).to.be.true;
    });

    it('should report what it deleted', async () => {
      const result = await runGc();
      expect(result.deletedObjects).to.equal(2); // the Version object and its Source
      expect(result.deletedSize).to.be.greaterThan(0);
      expect(result.keptVersions).to.equal(2);
    });
  });

  describe('--keep-versions', () => {
    beforeEach(async () => {
      await markAsExported();
    });

    it('should keep the older version when it is within the requested number of versions', async () => {
      await runGc({ keepVersions: 3 });
      expect(await objectExists(Ref.from(VERSION_HASHES['0.0.1']))).to.be.true;
      expect(await objectExists(sources['0.0.1'].hash())).to.be.true;
    });
    it('should still delete versions beyond the requested number', async () => {
      await runGc({ keepVersions: 2 });
      expect(await objectExists(Ref.from(VERSION_HASHES['0.0.1']))).to.be.false;
    });

    describe('when the component is on an exported lane', () => {
      /** the lane's own history: 0.0.3 -> laneSnap1 -> laneSnap2, none of it on main */
      const LANE_HASHES = { snap1: 'a'.repeat(40), snap2: 'b'.repeat(40) };
      let laneSources: { [snap: string]: Source };

      beforeEach(async () => {
        laneSources = {
          snap1: Source.from(Buffer.from('the contents of lane snap 1')),
          snap2: Source.from(Buffer.from('the contents of lane snap 2')),
        };
        const laneVersions = [
          buildVersion(LANE_HASHES.snap1, laneSources.snap1, [VERSION_HASHES['0.0.3']]),
          buildVersion(LANE_HASHES.snap2, laneSources.snap2, [LANE_HASHES.snap1]),
        ];
        const lane = Lane.create('my-lane', COMP_SCOPE);
        lane.addComponent({
          id: ComponentID.fromObject({ scope: COMP_SCOPE, name: COMP_NAME }),
          head: Ref.from(LANE_HASHES.snap2),
        });
        const objects = [lane, ...laneVersions, ...Object.values(laneSources)];
        objects.forEach((object) => {
          object.validateBeforePersist = false;
        });
        await scope.objects.writeObjectsToTheFS(objects);
        // exporting the lane is what makes its history prunable. while it is unexported the whole
        // chain is kept regardless, which would hide whether the recent-history walk found it.
        await scope.objects.remoteLanes.addEntry(
          LaneId.from('my-lane', COMP_SCOPE),
          ComponentID.fromObject({ scope: COMP_SCOPE, name: COMP_NAME }),
          Ref.from(LANE_HASHES.snap2)
        );
        await scope.objects.remoteLanes.write();
      });

      it('should keep the recent history of the lane, not of main', async () => {
        await runGc({ keepVersions: 2 });
        // the lane tip is a root on its own, so the predecessor is what proves the walk started
        // from the lane rather than from the main head
        expect(await objectExists(Ref.from(LANE_HASHES.snap1))).to.be.true;
        expect(await objectExists(laneSources.snap1.hash())).to.be.true;
      });
    });
  });

  describe('--dry-run', () => {
    beforeEach(async () => {
      await markAsExported();
    });

    it('should report what would be deleted without deleting it', async () => {
      const result = await runGc({ dryRun: true });
      expect(result.deletedObjects).to.equal(2);
      expect(await objectExists(Ref.from(VERSION_HASHES['0.0.1']))).to.be.true;
      expect(await objectExists(sources['0.0.1'].hash())).to.be.true;
    });

    it('should carry the requested backup mode, which has no directory to be inferred from', async () => {
      // without this the preview reads as a plain deletion and claims disk savings that the real
      // --backup run would not make, since it only moves the bytes within the scope.
      expect((await runGc({ dryRun: true, backup: true })).backup).to.be.true;
      expect((await runGc({ dryRun: true })).backup).to.be.false;
    });
  });

  describe('--backup', () => {
    beforeEach(async () => {
      await markAsExported();
    });

    it('should move the objects aside so they can be restored', async () => {
      await runGc({ backup: true });
      expect(await objectExists(Ref.from(VERSION_HASHES['0.0.1']))).to.be.false;
      await restoreDeletedObjects(scope);
      expect(await objectExists(Ref.from(VERSION_HASHES['0.0.1']))).to.be.true;
      expect(await objectExists(sources['0.0.1'].hash())).to.be.true;
    });

    it('should empty the backup directory once restored, so a later restore cannot replay it', async () => {
      const result = await runGc({ backup: true });
      const backupDir = result.backupDir as string;
      await restoreDeletedObjects(scope);
      // the objects are back in the scope. a second copy of them here is the disk space this
      // command exists to reclaim, and restoring it again would undo whatever ran since.
      expect(await fs.pathExists(backupDir)).to.be.false;
      let error: Error | undefined;
      try {
        await restoreDeletedObjects(scope);
      } catch (err: any) {
        error = err;
      }
      expect(error?.message).to.have.string('nothing to restore');
    });
  });

  describe('with a lane that was removed', () => {
    /** a snap that only the removed lane ever pointed at */
    const TRASHED_LANE_SNAP = 'd'.repeat(40);
    let trashedLaneSource: Source;

    beforeEach(async () => {
      await markAsExported();
      trashedLaneSource = Source.from(Buffer.from('the contents of a snap on a removed lane'));
      const laneVersion = buildVersion(TRASHED_LANE_SNAP, trashedLaneSource, [VERSION_HASHES['0.0.3']]);
      const lane = Lane.create('removed-lane', COMP_SCOPE);
      lane.addComponent({
        id: ComponentID.fromObject({ scope: COMP_SCOPE, name: COMP_NAME }),
        head: Ref.from(TRASHED_LANE_SNAP),
      });
      const objects = [lane, laneVersion, trashedLaneSource];
      objects.forEach((object) => {
        object.validateBeforePersist = false;
      });
      await scope.objects.writeObjectsToTheFS(objects);
      // deliberately not registered in remoteLanes: a remote ref is a root of its own, so an
      // exported lane's snaps survive whether or not the trash is read, and the test would pass
      // for the wrong reason.
      //
      // what `bit lane remove` does: the Lane object goes to the trash, from where it can be
      // brought back.
      await scope.objects.moveObjectsToTrash([lane.hash()]);
    });

    it('should keep the snaps it points at, so restoring the lane does not come back to nothing', async () => {
      await runGc();
      expect(await objectExists(Ref.from(TRASHED_LANE_SNAP))).to.be.true;
      expect(await objectExists(trashedLaneSource.hash())).to.be.true;
    });
  });

  describe('with an orphaned tag', () => {
    /** a tag that reached this scope through another remote's cache, so it is not on main history */
    const ORPHANED_HASH = 'c'.repeat(40);
    let orphanedSource: Source;

    beforeEach(async () => {
      await markAsExported();
      orphanedSource = Source.from(Buffer.from('the contents of an orphaned tag'));
      const orphanedVersion = buildVersion(ORPHANED_HASH, orphanedSource, []);
      const modelComponent = ModelComponent.from({
        name: COMP_NAME,
        scope: COMP_SCOPE,
        lang: 'javascript',
        deprecated: false,
        bindingPrefix: '@bit',
        versions: {
          '0.0.1': Ref.from(VERSION_HASHES['0.0.1']),
          '0.0.2': Ref.from(VERSION_HASHES['0.0.2']),
          '0.0.3': Ref.from(VERSION_HASHES['0.0.3']),
        },
        orphanedVersions: { '0.0.9': Ref.from(ORPHANED_HASH) },
        head: Ref.from(VERSION_HASHES['0.0.3']),
      });
      const objects = [modelComponent, orphanedVersion, orphanedSource];
      objects.forEach((object) => {
        object.validateBeforePersist = false;
      });
      await scope.objects.writeObjectsToTheFS(objects);
    });

    it('should keep it, as the component still resolves the tag and the origin may not have it', async () => {
      await runGc();
      expect(await objectExists(Ref.from(ORPHANED_HASH))).to.be.true;
      expect(await objectExists(orphanedSource.hash())).to.be.true;
    });
  });

  describe('with a detached head', () => {
    /** a locally created lineage hanging off 0.0.3: detachedParent -> detachedHead */
    const DETACHED = { parent: 'e'.repeat(40), head: 'f'.repeat(40) };
    let detachedSources: { [snap: string]: Source };

    beforeEach(async () => {
      await markAsExported();
      detachedSources = {
        parent: Source.from(Buffer.from('the contents of a detached parent')),
        head: Source.from(Buffer.from('the contents of a detached head')),
      };
      const detachedVersions = [
        buildVersion(DETACHED.parent, detachedSources.parent, [VERSION_HASHES['0.0.3']]),
        buildVersion(DETACHED.head, detachedSources.head, [DETACHED.parent]),
      ];
      const modelComponent = ModelComponent.from({
        name: COMP_NAME,
        scope: COMP_SCOPE,
        lang: 'javascript',
        deprecated: false,
        bindingPrefix: '@bit',
        versions: {
          '0.0.1': Ref.from(VERSION_HASHES['0.0.1']),
          '0.0.2': Ref.from(VERSION_HASHES['0.0.2']),
          '0.0.3': Ref.from(VERSION_HASHES['0.0.3']),
        },
        head: Ref.from(VERSION_HASHES['0.0.3']),
      });
      modelComponent.detachedHeads.setHead(Ref.from(DETACHED.head));
      const objects = [modelComponent, ...detachedVersions, ...Object.values(detachedSources)];
      objects.forEach((object) => {
        object.validateBeforePersist = false;
      });
      await scope.objects.writeObjectsToTheFS(objects);
    });

    it('should keep its unexported ancestry, not only the tip', async () => {
      await runGc();
      expect(await objectExists(Ref.from(DETACHED.head))).to.be.true;
      // the tip is a root on its own. the parent is what proves the chain was walked, and it is
      // reachable from nowhere else - nothing can bring it back.
      expect(await objectExists(Ref.from(DETACHED.parent))).to.be.true;
      expect(await objectExists(detachedSources.parent.hash())).to.be.true;
    });
  });

  describe('with a staged snap that no head reaches', () => {
    /** a snap recorded in staged-snaps whose chain hangs off 0.0.1, not off the head */
    const STAGED_HASH = '8'.repeat(40);
    let stagedSource: Source;

    beforeEach(async () => {
      await markAsExported();
      stagedSource = Source.from(Buffer.from('the contents of a staged snap'));
      const stagedVersion = buildVersion(STAGED_HASH, stagedSource, [VERSION_HASHES['0.0.1']]);
      stagedVersion.validateBeforePersist = false;
      stagedSource.validateBeforePersist = false;
      await scope.objects.writeObjectsToTheFS([stagedVersion, stagedSource]);
      scope.stagedSnaps.addSnap(STAGED_HASH);
      await scope.stagedSnaps.write();
    });

    it('should keep its unexported ancestry, since export sends the whole chain', async () => {
      await runGc();
      expect(await objectExists(Ref.from(STAGED_HASH))).to.be.true;
      // 0.0.1 is reachable from the staged snap and from nowhere else that keeps it
      expect(await objectExists(Ref.from(VERSION_HASHES['0.0.1']))).to.be.true;
      expect(await objectExists(sources['0.0.1'].hash())).to.be.true;
    });
  });

  describe('with a component whose model object is missing', () => {
    it('should still keep the snap the workspace is checked out at', async () => {
      await markAsExported();
      // the bitmap names a snap hash, which stands on its own - losing the component object must
      // not take the version the working directory is being diffed against with it.
      await settleObjects();
      const result = await collectGarbageInWorkspace(scope, [
        ComponentID.fromObject({ scope: COMP_SCOPE, name: 'no-such-component' }).changeVersion(VERSION_HASHES['0.0.1']),
      ]);
      expect(result.deletedObjects).to.be.greaterThan(0); // the run did proceed
      expect(await objectExists(Ref.from(VERSION_HASHES['0.0.1']))).to.be.true;
    });
  });

  describe('with a component that was never exported', () => {
    it('should keep its entire history, as nothing can bring these snaps back', async () => {
      const result = await runGc();
      expect(result.deletedObjects).to.equal(0);
      expect(await objectExists(Ref.from(VERSION_HASHES['0.0.1']))).to.be.true;
      expect(await objectExists(sources['0.0.1'].hash())).to.be.true;
    });
  });

  describe('with a version held by a stash', () => {
    beforeEach(async () => {
      await markAsExported();
      // `bit stash` records the hash in a file of its own and nowhere else, so this is the only
      // thing standing between the stashed snap and deletion.
      await fs.outputJson(path.join(scope.path, 'stash', 'stash-1.json'), {
        metadata: { message: 'a stash' },
        stashCompsData: [
          {
            id: { scope: COMP_SCOPE, name: COMP_NAME },
            hash: VERSION_HASHES['0.0.1'],
            isNew: false,
            bitmapEntry: {},
          },
        ],
      });
    });

    it('should keep the stashed version and its files, as nothing can bring them back', async () => {
      const result = await runGc();
      expect(result.deletedObjects).to.equal(0);
      expect(await objectExists(Ref.from(VERSION_HASHES['0.0.1']))).to.be.true;
      expect(await objectExists(sources['0.0.1'].hash())).to.be.true;
    });

    it('should refuse to run when a stash file cannot be read, rather than assume it holds nothing', async () => {
      await fs.outputFile(path.join(scope.path, 'stash', 'stash-1.json'), '{ this is not json');
      let error: Error | undefined;
      try {
        await runGc();
      } catch (err: any) {
        error = err;
      }
      expect(error).to.be.an('error');
      expect(error?.message).to.have.string('not safe to run gc');
      expect(await objectExists(Ref.from(VERSION_HASHES['0.0.1']))).to.be.true;
      expect(await objectExists(sources['0.0.1'].hash())).to.be.true;
    });

    it('should refuse to run when a stash parses but has no "stashCompsData"', async () => {
      // valid json, but not a stash bit could load either. reading it as an empty stash is the one
      // reading that deletes the snaps it was holding.
      await fs.outputJson(path.join(scope.path, 'stash', 'stash-1.json'), { metadata: { message: 'a stash' } });
      let error: Error | undefined;
      try {
        await runGc();
      } catch (err: any) {
        error = err;
      }
      expect(error).to.be.an('error');
      expect(error?.message).to.have.string('not safe to run gc');
      expect(await objectExists(Ref.from(VERSION_HASHES['0.0.1']))).to.be.true;
      expect(await objectExists(sources['0.0.1'].hash())).to.be.true;
    });

    it('should keep the parent of the stashed snap, which stash load reads as its merge base', async () => {
      // the stash Version's parent is the pre-stash version; `addComponentDataToRepo` sets it
      // precisely so that "stash-load" has a base for its three-way merge.
      const stashedSource = Source.from(Buffer.from('the contents of a stashed snap'));
      const STASHED_HASH = '9'.repeat(40);
      // its parent is 0.0.1, the version that is otherwise collectable
      const stashedVersion = buildVersion(STASHED_HASH, stashedSource, [VERSION_HASHES['0.0.1']]);
      const objects = [stashedVersion, stashedSource];
      objects.forEach((object) => {
        object.validateBeforePersist = false;
      });
      await scope.objects.writeObjectsToTheFS(objects);
      await fs.outputJson(path.join(scope.path, 'stash', 'stash-1.json'), {
        metadata: { message: 'a stash' },
        stashCompsData: [
          { id: { scope: COMP_SCOPE, name: COMP_NAME }, hash: STASHED_HASH, isNew: false, bitmapEntry: {} },
        ],
      });
      await runGc();
      expect(await objectExists(Ref.from(STASHED_HASH))).to.be.true;
      expect(await objectExists(Ref.from(VERSION_HASHES['0.0.1']))).to.be.true;
      expect(await objectExists(sources['0.0.1'].hash())).to.be.true;
    });

    it('should refuse to run when a stashed component has no hash, rather than skip it', async () => {
      await fs.outputJson(path.join(scope.path, 'stash', 'stash-1.json'), {
        metadata: { message: 'a stash' },
        stashCompsData: [{ id: { scope: COMP_SCOPE, name: COMP_NAME }, isNew: false, bitmapEntry: {} }],
      });
      let error: Error | undefined;
      try {
        await runGc();
      } catch (err: any) {
        error = err;
      }
      expect(error).to.be.an('error');
      expect(error?.message).to.have.string('not safe to run gc');
      expect(await objectExists(Ref.from(VERSION_HASHES['0.0.1']))).to.be.true;
    });
  });

  describe('when an object cannot be classified', () => {
    beforeEach(async () => {
      await markAsExported();
    });

    it('should refuse to delete anything rather than act on a partial inventory', async () => {
      // truncating makes the object unreadable while keeping it a valid object path
      await fs.writeFile(scope.objects.objectPath(Ref.from(VERSION_HASHES['0.0.2'])), 'not a real object');
      let error: Error | undefined;
      try {
        await runGc();
      } catch (err: any) {
        error = err;
      }
      expect(error).to.be.an('error');
      expect(error?.message).to.have.string('not safe to run gc');
      // the version that would otherwise have been collected is still here
      expect(await objectExists(Ref.from(VERSION_HASHES['0.0.1']))).to.be.true;
      expect(await objectExists(sources['0.0.1'].hash())).to.be.true;
    });
  });

  /**
   * the collector classifies every object by type, and the whole design rests on doing that from
   * each file's header rather than by inflating its contents - a scope is mostly `Source` objects,
   * and they are the ones it must never have to read.
   */
  describe('classifying the objects', () => {
    let contentReads: number;
    const original = {
      onPostObjectRead: Repository.onPostObjectRead,
      hasPostObjectReadTransformer: Repository.hasPostObjectReadTransformer,
    };

    beforeEach(() => {
      contentReads = 0;
      // the scope aspect installs this hook whether or not anything registered a transformer, so
      // its presence alone must not be taken as a reason to read contents.
      Repository.onPostObjectRead = (content) => {
        contentReads += 1;
        return content;
      };
    });

    afterEach(() => {
      Repository.onPostObjectRead = original.onPostObjectRead;
      Repository.hasPostObjectReadTransformer = original.hasPostObjectReadTransformer;
    });

    it('should not read object contents when no transformer is registered', async () => {
      Repository.hasPostObjectReadTransformer = () => false;
      const { objects, unreadable } = await scope.objects.listObjectsWithType();
      expect(unreadable).to.have.lengthOf(0);
      expect(objects).to.have.length.greaterThan(0);
      expect(contentReads).to.equal(0);
    });

    it('should read them in full when a transformer is registered, as the header is transformed too', async () => {
      Repository.hasPostObjectReadTransformer = () => true;
      const { objects, unreadable } = await scope.objects.listObjectsWithType();
      expect(unreadable).to.have.lengthOf(0);
      expect(contentReads).to.equal(objects.length);
      expect(objects.some((object) => object.type === Source.name)).to.be.true;
    });
  });

  describe('stray temp files of interrupted writes', () => {
    beforeEach(async () => {
      await markAsExported();
    });

    const strayContents = 'leftovers';
    let strayPath: string;

    /** an interrupted write is old by definition; a fresh one is someone writing right now */
    const backdate = async (filePath: string) => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      await fs.utimes(filePath, twoHoursAgo, twoHoursAgo);
    };

    beforeEach(async () => {
      strayPath = path.join(
        scope.objects.getPath(),
        VERSION_HASHES['0.0.1'].slice(0, 2),
        `${VERSION_HASHES['0.0.1'].slice(2)}.3955502210`
      );
      await fs.outputFile(strayPath, strayContents);
      await backdate(strayPath);
    });

    it('should remove them', async () => {
      const result = await runGc();
      expect(result.strayFiles).to.equal(1);
      expect(await fs.pathExists(strayPath)).to.be.false;
    });

    it('should count their bytes, as they are deleted outright and so are part of what was freed', async () => {
      const result = await runGc();
      expect(result.strayFilesSize).to.equal(strayContents.length);
    });

    it('should include their bytes in the scope size, which is measured before they are removed', async () => {
      const withStray = await runGc({ dryRun: true });
      await fs.remove(strayPath);
      const withoutStray = await runGc({ dryRun: true });
      expect(withStray.totalSize - withoutStray.totalSize).to.equal(strayContents.length);
    });

    it('should leave a recent one alone, as it may be an object write in progress', async () => {
      // a file of this shape is also what write-file-atomic leaves while it writes, and unlinking
      // one out from under another bit process would fail its rename.
      const freshPath = path.join(
        scope.objects.getPath(),
        VERSION_HASHES['0.0.2'].slice(0, 2),
        `${VERSION_HASHES['0.0.2'].slice(2)}.1234567890`
      );
      await fs.outputFile(freshPath, 'a write in progress');
      const result = await runGc();
      expect(result.strayFiles).to.equal(1);
      expect(await fs.pathExists(freshPath)).to.be.true;
      expect(await fs.pathExists(strayPath)).to.be.false;
    });
  });
});
