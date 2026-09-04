import { expect } from 'chai';
import type { VersionCandidate } from './published-versions';
import { findVersionNotPublished, getNextVersion, skipPublishedVersions } from './published-versions';

describe('published-versions', () => {
  describe('getNextVersion', () => {
    it('should bump the patch of a release version', () => {
      expect(getNextVersion('1.2.3')).to.equal('1.2.4');
    });
    it('should keep the pre-release identifier of a pre-release version', () => {
      expect(getNextVersion('1.2.3-dev.1')).to.equal('1.2.3-dev.2');
    });
    it('should bump a numeric pre-release', () => {
      expect(getNextVersion('1.2.3-0')).to.equal('1.2.3-1');
    });
  });

  describe('findVersionNotPublished', () => {
    const findVersion = (version: string, published: string[], takenLocally: string[] = []) =>
      findVersionNotPublished({
        packageName: '@teambit/some-comp',
        version,
        isPublished: async (_pkgName, ver) => published.includes(ver),
        isTakenLocally: (ver) => takenLocally.includes(ver),
      });

    it('should return the version as is when it is not in the registry', async () => {
      expect(await findVersion('1.2.3', ['1.2.2'])).to.equal('1.2.3');
    });
    it('should skip a version that is in the registry', async () => {
      expect(await findVersion('1.2.3', ['1.2.3'])).to.equal('1.2.4');
    });
    it('should skip multiple consecutive versions that are in the registry', async () => {
      expect(await findVersion('1.2.3', ['1.2.3', '1.2.4', '1.2.5'])).to.equal('1.2.6');
    });
    it('should skip a version that exists only in the local model', async () => {
      expect(await findVersion('1.2.3', [], ['1.2.3'])).to.equal('1.2.4');
    });
    it('should keep the pre-release identifier when skipping', async () => {
      expect(await findVersion('1.2.3-dev.1', ['1.2.3-dev.1'])).to.equal('1.2.3-dev.2');
    });
    it('should not query the registry more than once per candidate', async () => {
      const queried: string[] = [];
      const result = await findVersionNotPublished({
        packageName: '@teambit/some-comp',
        version: '1.2.3',
        isPublished: async (_pkgName, ver) => {
          queried.push(ver);
          return ver === '1.2.3';
        },
      });
      expect(result).to.equal('1.2.4');
      expect(queried).to.deep.equal(['1.2.3', '1.2.4']);
    });
    it('should throw when too many consecutive versions are in the registry', async () => {
      const published = ['1.2.3', '1.2.4', '1.2.5', '1.2.6'];
      let error: Error | undefined;
      try {
        await findVersionNotPublished({
          packageName: '@teambit/some-comp',
          version: '1.2.3',
          isPublished: async (_pkgName, ver) => published.includes(ver),
          maxToSkip: 2,
        });
      } catch (err: any) {
        error = err;
      }
      expect(error?.message).to.have.string('unable to find an unpublished version');
    });
  });

  describe('skipPublishedVersions', () => {
    const candidatesOf = (count: number): VersionCandidate[] =>
      Array.from({ length: count }, (_, index) => candidate(`comp${index}`));

    it('should query every candidate, so a partial publish is not missed', async () => {
      const queried = new Set<string>();
      const skipped = await skipPublishedVersions({
        candidates: candidatesOf(50),
        // npm rate-limited the previous run halfway through, so only one component got published
        isPublished: async (packageName, version) => {
          queried.add(packageName);
          return packageName === '@teambit/comp49' && version === '1.0.0';
        },
      });
      expect(queried.size).to.equal(50);
      expect([...skipped.keys()]).to.deep.equal(['comp49']);
      expect(skipped.get('comp49')).to.equal('1.0.1');
    });

    it('should skip every component when the whole run collided', async () => {
      const skipped = await skipPublishedVersions({
        candidates: candidatesOf(50),
        isPublished: async (_packageName, version) => version === '1.0.0',
      });
      expect(skipped.size).to.equal(50);
      expect(skipped.get('comp0')).to.equal('1.0.1');
    });

    it('should report nothing when no version is in the registry', async () => {
      const skipped = await skipPublishedVersions({
        candidates: candidatesOf(10),
        isPublished: async () => false,
      });
      expect(skipped.size).to.equal(0);
    });

    it('should do nothing when there are no candidates', async () => {
      const skipped = await skipPublishedVersions({
        candidates: [],
        isPublished: async () => {
          throw new Error('should not query the registry');
        },
      });
      expect(skipped.size).to.equal(0);
    });
  });
});

function candidate(id: string): VersionCandidate {
  return { id, packageName: `@teambit/${id}`, version: '1.0.0' };
}
