import { expect } from 'chai';
import { Registries, Registry } from '@teambit/pkg.entities.registry';
import type { VersionCandidate } from './published-versions';
import {
  MAX_PUBLISHED_VERSIONS_TO_SKIP,
  findVersionNotPublished,
  getNextVersion,
  getRegistryForPackage,
  skipPublishedVersions,
} from './published-versions';

function candidate(id: string): VersionCandidate {
  return { id, packageName: `@teambit/${id}`, version: '1.0.0' };
}

const candidatesOf = (count: number): VersionCandidate[] =>
  Array.from({ length: count }, (_, index) => candidate(`comp${index}`));

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
    const findVersion = (version: string, published: string[]) =>
      findVersionNotPublished({ ...candidate('some-comp'), version }, async (_pkgName, ver) => published.includes(ver));

    it('should return the version as is when it is not in the registry', async () => {
      expect(await findVersion('1.2.3', ['1.2.2'])).to.equal('1.2.3');
    });
    it('should skip a version that is in the registry, querying each candidate once', async () => {
      const queried: string[] = [];
      const result = await findVersionNotPublished({ ...candidate('some-comp'), version: '1.2.3' }, async (_, ver) => {
        queried.push(ver);
        return ver === '1.2.3';
      });
      expect(result).to.equal('1.2.4');
      expect(queried).to.deep.equal(['1.2.3', '1.2.4']);
    });
    it('should skip multiple consecutive versions that are in the registry', async () => {
      expect(await findVersion('1.2.3', ['1.2.3', '1.2.4', '1.2.5'])).to.equal('1.2.6');
    });
    it('should keep the pre-release identifier when skipping', async () => {
      expect(await findVersion('1.2.3-dev.1', ['1.2.3-dev.1'])).to.equal('1.2.3-dev.2');
    });
    it('should throw when too many consecutive versions are in the registry', async () => {
      const published = Array.from({ length: MAX_PUBLISHED_VERSIONS_TO_SKIP + 1 }, (_, index) => `1.2.${3 + index}`);
      let error: Error | undefined;
      try {
        await findVersion('1.2.3', published);
      } catch (err: any) {
        error = err;
      }
      expect(error?.message).to.have.string('unable to find an unpublished version');
    });
  });

  describe('skipPublishedVersions', () => {
    it('should query every candidate, so a partial publish is not missed', async () => {
      const queried = new Set<string>();
      // npm rate-limited the previous run halfway through, so only one component got published
      const skipped = await skipPublishedVersions(candidatesOf(50), async (packageName, version) => {
        queried.add(packageName);
        return packageName === '@teambit/comp49' && version === '1.0.0';
      });
      expect(queried.size).to.equal(50);
      expect(skipped.map(({ id, versionToTag }) => [id, versionToTag])).to.deep.equal([['comp49', '1.0.1']]);
    });

    it('should skip every component when the whole run collided', async () => {
      const skipped = await skipPublishedVersions(
        candidatesOf(50),
        async (_packageName, version) => version === '1.0.0'
      );
      expect(skipped.length).to.equal(50);
      expect(skipped[0]).to.include({ id: 'comp0', versionToTag: '1.0.1' });
    });

    it('should report nothing when no version is in the registry', async () => {
      const skipped = await skipPublishedVersions(candidatesOf(10), async () => false);
      expect(skipped).to.deep.equal([]);
    });

    it('should ask the registry the component publishes to, not the scope default', async () => {
      const asked: (string | undefined)[] = [];
      const candidates = [
        { ...candidate('comp0'), registryUrl: 'https://my-registry.example.com' },
        candidate('comp1'),
      ];
      await skipPublishedVersions(candidates, async (_packageName, _version, registryUrl) => {
        asked.push(registryUrl);
        return false;
      });
      expect(asked).to.have.members(['https://my-registry.example.com', undefined]);
    });
  });

  describe('getRegistryForPackage', () => {
    const registries = new Registries(new Registry('https://registry.npmjs.org/', true, 'Bearer default-token'), {
      teambit: new Registry('https://node.bit.cloud/', true, 'Bearer bit-token'),
      acme: new Registry('https://private.example.com/npm/', true, 'Bearer acme-token'),
    });

    it('should use the registry of the package scope', () => {
      expect(getRegistryForPackage(registries, '@teambit/some-comp').authHeaderValue).to.equal('Bearer bit-token');
    });
    it('should fall back to the default registry for an unmapped scope', () => {
      expect(getRegistryForPackage(registries, '@other/some-comp').authHeaderValue).to.equal('Bearer default-token');
    });
    it('should fall back to the default registry for an unscoped package', () => {
      expect(getRegistryForPackage(registries, 'some-comp').uri).to.equal('https://registry.npmjs.org/');
    });
    it('should prefer an explicit publish registry over the scope one', () => {
      const registry = getRegistryForPackage(registries, '@teambit/some-comp', 'https://private.example.com/npm/');
      expect(registry.uri).to.equal('https://private.example.com/npm/');
      expect(registry.authHeaderValue).to.equal('Bearer acme-token');
    });
    it('should reuse the credentials of a configured registry that covers the url', () => {
      // npmrc keys credentials by url prefix, so the /npm/ entry covers /npm/internal/ too
      const registry = getRegistryForPackage(registries, '@teambit/x', 'https://private.example.com/npm/internal/');
      expect(registry.authHeaderValue).to.equal('Bearer acme-token');
    });
    it('should not borrow credentials from a different host', () => {
      const registry = getRegistryForPackage(registries, '@teambit/x', 'https://elsewhere.example.com/npm/');
      expect(registry.uri).to.equal('https://elsewhere.example.com/npm/');
      expect(registry.authHeaderValue).to.equal(undefined);
    });
  });
});
