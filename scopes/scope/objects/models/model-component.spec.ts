import { expect } from 'chai';

import ModelComponent from './model-component';
import { cloneDeep } from 'lodash';
import { Ref } from '../objects';
import VersionHistory from './version-history';

const modelComponentFixture = {
  name: 'bar/foo',
  scope: 'remote-scope',
  versions: {
    '0.0.1': '125a37bdb17220bdc1406a9a28a3dde4eec91225',
  },
  lang: 'javascript',
  deprecated: false,
  bindingPrefix: '@bit',
  remotes: [
    {
      url: 'file:///tmp/remote-scope',
      name: 'remote-scope',
      date: '1572532837438',
    },
  ],
  state: {
    versions: {
      '0.0.1': {
        local: true,
      },
    },
  },
};

const getModelComponentFixture = (): typeof modelComponentFixture => {
  return cloneDeep(modelComponentFixture);
};

const getModelComponent = (obj: object): ModelComponent => {
  return ModelComponent.parse(JSON.stringify(obj));
};

describe('ModelComponent', () => {
  describe('validate', () => {
    let validateFunc: Function;
    describe('duplicate hashes', () => {
      let modelComponent: ModelComponent;
      before(() => {
        const fixture = getModelComponentFixture();
        fixture.versions['0.0.2'] = fixture.versions['0.0.1'];
        modelComponent = getModelComponent(fixture);
        validateFunc = () => modelComponent.validate();
      });
      it('should throw an error', () => {
        expect(validateFunc).to.throw('the following hash(es) are duplicated');
      });
    });
  });
  describe('versions lookup', () => {
    const tagHash = '125a37bdb17220bdc1406a9a28a3dde4eec91225';
    const orphanedHash = '225a37bdb17220bdc1406a9a28a3dde4eec91225';
    let modelComponent: ModelComponent;
    before(() => {
      modelComponent = getModelComponent(getModelComponentFixture());
      modelComponent.setOrphanedVersion('0.0.3', Ref.from(orphanedHash));
    });
    it('should find the ref of a tag and of an orphaned tag', () => {
      expect(modelComponent.getRef('0.0.1')?.toString()).to.equal(tagHash);
      expect(modelComponent.getRef('0.0.3')?.toString()).to.equal(orphanedHash);
    });
    it('should find the tag of a ref and of an orphaned ref', () => {
      expect(modelComponent.getTagOfRefIfExists(Ref.from(tagHash))).to.equal('0.0.1');
      expect(modelComponent.getTagOfRefIfExists(Ref.from(orphanedHash))).to.equal('0.0.3');
      expect(
        modelComponent.switchHashesWithTagsIfExist([Ref.from(orphanedHash), Ref.from('a'.repeat(40))])
      ).to.deep.equal(['0.0.3', 'a'.repeat(40)]);
    });
    it('should find the newest tag of a ref and not return a remembered tag after the versions changed', () => {
      const component = getModelComponent(getModelComponentFixture());
      const ref = Ref.from(tagHash);
      component.setVersion('0.0.2', Ref.from('b'.repeat(40)));
      expect(component.getTagOfRefIfExists(ref)).to.equal('0.0.1');
      component.removeVersion('0.0.1');
      expect(component.getTagOfRefIfExists(ref)).to.be.undefined;
      component.setVersion('0.0.5', ref);
      expect(component.getTagOfRefIfExists(ref)).to.equal('0.0.5');
    });
    it('should prefer a tag over an orphaned tag of the same ref, even after the orphaned one was found', () => {
      const component = getModelComponent(getModelComponentFixture());
      const ref = Ref.from('c'.repeat(40));
      component.setOrphanedVersion('0.0.7', ref);
      expect(component.getTagOfRefIfExists(ref)).to.equal('0.0.7');
      component.setVersion('0.0.8', ref);
      expect(component.getTagOfRefIfExists(ref)).to.equal('0.0.8');
    });
    it('should find a tag added after a lookup, also after it was moved to the orphaned versions', () => {
      const component = getModelComponent(getModelComponentFixture());
      const ref = Ref.from('d'.repeat(40));
      expect(component.getTagOfRefIfExists(ref)).to.be.undefined;
      component.setVersion('0.0.9', ref);
      expect(component.getTagOfRefIfExists(ref)).to.equal('0.0.9');
      component.moveVersionToOrphaned('0.0.9');
      expect(component.versions['0.0.9']).to.be.undefined;
      expect(component.orphanedVersions['0.0.9']?.toString()).to.equal(ref.toString());
      expect(component.getTagOfRefIfExists(ref)).to.equal('0.0.9');
    });
    it('should not find an orphaned tag after the orphaned versions were cleared', () => {
      const component = getModelComponent(getModelComponentFixture());
      const ref = Ref.from('e'.repeat(40));
      component.setOrphanedVersion('0.0.4', ref);
      expect(component.getTagOfRefIfExists(ref)).to.equal('0.0.4');
      component.clearOrphanedVersions();
      expect(component.getTagOfRefIfExists(ref)).to.be.undefined;
    });
    it('should serialize the versions as before and not the tags index, as `bit cat-scope --json` does', () => {
      const component = getModelComponent(getModelComponentFixture());
      component.setOrphanedVersion('0.0.3', Ref.from(orphanedHash));
      component.getTagOfRefIfExists(Ref.from(tagHash));
      const serialized = JSON.parse(JSON.stringify(component));
      expect(serialized.versions).to.have.property('0.0.1');
      expect(serialized.orphanedVersions).to.have.property('0.0.3');
      expect(Object.keys(serialized).filter((key) => /tag/i.test(key))).to.deep.equal([]);
    });
    it('should stay fast looking up every version of a component with many tags, and snaps that are not tags', () => {
      const size = 20000;
      const hash = (i: number) => i.toString(16).padStart(40, '0');
      const component = getModelComponent(getModelComponentFixture());
      for (let i = 0; i < size; i += 1) component.setVersion(`1.0.${i}`, Ref.from(hash(i)));
      const refs = Array.from({ length: size * 2 }, (_, i) => Ref.from(hash(i)));
      const start = Date.now();
      const tags = component.switchHashesWithTagsIfExist(refs);
      expect(tags[size - 1]).to.equal(`1.0.${size - 1}`);
      expect(tags[size]).to.equal(hash(size));
      expect(Date.now() - start).to.be.lessThan(2000);
    });
  });

  describe('populateVersionHistoryIfMissingGracefully', () => {
    const hash = (i: number) => i.toString(16).padStart(40, '0');
    const ref = (i: number) => new Ref(hash(i));
    /** a version object of the given number, as the history population reads it. */
    const versionObject = (i: number, parents: number[] = i > 0 ? [i - 1] : []): any => ({
      hash: () => ref(i),
      parents: parents.map(ref),
    });
    /** a repo holding these version objects, which records what it loads. */
    const fakeRepo = (versions: any[]) => {
      const byHash = new Map(versions.map((v) => [v.hash().toString(), v]));
      const loaded: string[] = [];
      return {
        loaded,
        load: async (r: Ref) => {
          loaded.push(r.toString());
          return byHash.get(r.toString());
        },
        writeObjectsToTheFS: async () => {},
      } as any;
    };
    const component = () => getModelComponent(getModelComponentFixture());
    const historyHashes = (versionHistory: VersionHistory) => versionHistory.getAllHashesAsString().sort();

    it('adds the head and all its ancestors to an empty history', async () => {
      const versionHistory = VersionHistory.create('bar/foo', 'remote-scope', []);
      const repo = fakeRepo([0, 1, 2, 3].map((i) => versionObject(i)));
      const { err } = await component().populateVersionHistoryIfMissingGracefully(repo, versionHistory, ref(3));
      expect(err).to.be.undefined;
      expect(historyHashes(versionHistory)).to.deep.equal([0, 1, 2, 3].map(hash).sort());
    });

    it('loads a shared ancestor of a merge snap only once', async () => {
      // 0 <- 1 <- 3, 0 <- 2 <- 3
      const versionHistory = VersionHistory.create('bar/foo', 'remote-scope', []);
      const repo = fakeRepo([versionObject(0), versionObject(1, [0]), versionObject(2, [0]), versionObject(3, [1, 2])]);
      await component().populateVersionHistoryIfMissingGracefully(repo, versionHistory, ref(3));
      expect(repo.loaded.filter((h: string) => h === hash(0))).to.have.length(1);
      expect(historyHashes(versionHistory)).to.deep.equal([0, 1, 2, 3].map(hash).sort());
    });

    it('stops at versions the history already has', async () => {
      const versionHistory = VersionHistory.create('bar/foo', 'remote-scope', []);
      versionHistory.addFromVersionsObjects([versionObject(0), versionObject(1)]);
      const repo = fakeRepo([0, 1, 2, 3].map((i) => versionObject(i)));
      await component().populateVersionHistoryIfMissingGracefully(repo, versionHistory, ref(3));
      expect(repo.loaded).to.deep.equal([hash(3), hash(2)]);
    });

    it('returns the added versions and an error when a parent is missing', async () => {
      const versionHistory = VersionHistory.create('bar/foo', 'remote-scope', []);
      const repo = fakeRepo([versionObject(2), versionObject(3)]);
      const { err, added } = await component().populateVersionHistoryIfMissingGracefully(repo, versionHistory, ref(3));
      expect(err).to.be.instanceOf(Error);
      expect(added?.map((v) => v.hash.toString())).to.deep.equal([hash(3), hash(2)]);
    });

    it('stays fast when the whole of a long history is missing', async () => {
      const size = 10000;
      const versionHistory = VersionHistory.create('bar/foo', 'remote-scope', []);
      const repo = fakeRepo(Array.from({ length: size }, (_, i) => versionObject(i)));
      const start = Date.now();
      await component().populateVersionHistoryIfMissingGracefully(repo, versionHistory, ref(size - 1));
      expect(versionHistory.versions).to.have.length(size);
      expect(Date.now() - start).to.be.lessThan(2000);
    });
  });
});
