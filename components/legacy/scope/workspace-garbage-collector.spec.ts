import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { ComponentID } from '@teambit/component-id';
import { LaneId, DEFAULT_LANE } from '@teambit/lane-id';
import { ModelComponent, Ref, Source, Version } from '@teambit/objects';
import Scope from './scope';
import { collectGarbageInWorkspace } from './workspace-garbage-collector';

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

  /** the workspace is checked out at 0.0.2, while the component's head is 0.0.3 */
  const runGc = (opts = {}) =>
    collectGarbageInWorkspace(
      scope,
      [ComponentID.fromObject({ scope: COMP_SCOPE, name: COMP_NAME }).changeVersion('0.0.2')],
      opts
    );

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
  });

  describe('--backup', () => {
    beforeEach(async () => {
      await markAsExported();
    });

    it('should move the objects aside so they can be restored', async () => {
      await runGc({ backup: true });
      expect(await objectExists(Ref.from(VERSION_HASHES['0.0.1']))).to.be.false;
      await scope.restoreGarbageCollected();
      expect(await objectExists(Ref.from(VERSION_HASHES['0.0.1']))).to.be.true;
      expect(await objectExists(sources['0.0.1'].hash())).to.be.true;
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

  describe('stray temp files of interrupted writes', () => {
    beforeEach(async () => {
      await markAsExported();
    });

    it('should remove them', async () => {
      const strayPath = path.join(
        scope.objects.getPath(),
        VERSION_HASHES['0.0.1'].slice(0, 2),
        `${VERSION_HASHES['0.0.1'].slice(2)}.3955502210`
      );
      await fs.outputFile(strayPath, 'leftovers');
      const result = await runGc();
      expect(result.strayFiles).to.equal(1);
      expect(await fs.pathExists(strayPath)).to.be.false;
    });
  });
});
