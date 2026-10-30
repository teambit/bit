import { SemVer } from 'semver';
import { memoize } from 'lodash';
import { getFetcherWithAgent } from '@teambit/scope.network';
import { BitError } from '@teambit/bit-error';
import { pMapPool } from '@teambit/toolbox.promise.map-pool';
import { concurrentFetchLimit } from '@teambit/harmony.modules.concurrency';
import type { Registries, Registry } from '@teambit/pkg.entities.registry';

/**
 * npm publish runs as the last task of the tag build pipeline, which is *before* the export (see
 * `bit ci merge`). when an export fails after the packages were already published, the registry is
 * left ahead of both the remote scope and .bitmap. the next run then computes the exact same
 * version again, and npm rejects it with "You cannot publish over the previously published
 * versions" (E403), so the release stays stuck until someone bumps the CI config by hand with
 * `--increment-by`.
 *
 * skipping the versions the registry already has lets that retry pick the next free version on its
 * own. it's done per-component, so unlike `--increment-by` it only bumps the components that
 * actually collide.
 */

export type IsVersionPublished = (packageName: string, version: string, registryUrl?: string) => Promise<boolean>;

/**
 * a collision means a previous run published this component and then failed, so the number of
 * versions to skip is the number of such runs. anything beyond this is not a stuck release but a
 * broken setup (e.g. the wrong package name), and hammering the registry won't fix it.
 */
export const MAX_PUBLISHED_VERSIONS_TO_SKIP = 20;

const REGISTRY_REQUEST_TIMEOUT = 10000;

export type VersionCandidate = {
  /** component id, used to report back which versions changed */
  id: string;
  packageName: string;
  version: string;
  /**
   * the registry `npm publish` will target for this component, when it is not the one configured
   * for the package's scope. asking any other registry would say "free" about a taken version.
   */
  registryUrl?: string;
};

export type SkippedVersion = VersionCandidate & { versionToTag: string };

/**
 * the version right after `version`, keeping its pre-release identifier when it has one.
 * e.g. "1.2.3" => "1.2.4", "1.2.3-dev.1" => "1.2.3-dev.2".
 */
export function getNextVersion(version: string): string {
  const semver = new SemVer(version);
  const preReleaseId = typeof semver.prerelease[0] === 'string' ? semver.prerelease[0] : undefined;
  const releaseType = semver.prerelease.length ? 'prerelease' : 'patch';
  return semver.inc(releaseType, preReleaseId).version;
}

/**
 * return the candidate's version, or - when it was already published to the registry - the next
 * version that wasn't.
 */
export async function findVersionNotPublished(
  candidate: VersionCandidate,
  isPublished: IsVersionPublished
): Promise<string> {
  const { packageName, version, registryUrl } = candidate;
  let versionToTag = version;
  for (let skipped = 0; skipped <= MAX_PUBLISHED_VERSIONS_TO_SKIP; skipped += 1) {
    if (!(await isPublished(packageName, versionToTag, registryUrl))) return versionToTag;
    versionToTag = getNextVersion(versionToTag);
  }
  throw new BitError(
    `unable to find an unpublished version for ${packageName}, the ${MAX_PUBLISHED_VERSIONS_TO_SKIP} versions following ${version} are all in the registry.
this is unlikely to be a stuck release. make sure the package name is correct and that the registry is not returning stale data`
  );
}

/**
 * resolve the version to tag for each candidate.
 *
 * every candidate is checked, rather than a sample of them: a publish that failed midway (npm rate
 * limiting is the usual reason) leaves only *some* of the components published, so there is no
 * component whose answer can be taken to hold for the rest. it is cheap enough to be thorough -
 * measured against registry.npmjs.org, 400 checks take ~11s, against a merge job that runs for
 * close to an hour.
 *
 * @returns the candidates whose version changed.
 */
export async function skipPublishedVersions(
  candidates: VersionCandidate[],
  isPublished: IsVersionPublished
): Promise<SkippedVersion[]> {
  const resolved = await pMapPool(
    candidates,
    async (candidate: VersionCandidate): Promise<SkippedVersion> => ({
      ...candidate,
      versionToTag: await findVersionNotPublished(candidate, isPublished),
    }),
    { concurrency: concurrentFetchLimit() }
  );
  return resolved.filter((candidate) => candidate.versionToTag !== candidate.version);
}

/**
 * ask the registry for one specific version rather than for the package document. the packument of
 * a component that publishes on every snap is tens of megabytes (over 20MB for some of bit's own
 * components), while this endpoint answers the same question in a few kilobytes - or 29 bytes for
 * the "not published" answer, which is the common one.
 *
 * the request goes through the same agent bit uses elsewhere, so a configured proxy, CA, client
 * certificate and strict-ssl setting all apply. without them the request would fail, and a failure
 * reads here as "not published" - it would quietly defeat the check rather than report anything.
 */
export function createIsVersionPublished(
  registries: Registries,
  logger: { debug: (message: string) => void }
): IsVersionPublished {
  // one fetcher per registry: building it reads bit's global config, no need to redo that per request
  const getFetcher = memoize(getFetcherWithAgent);

  return async (packageName: string, version: string, registryUrl?: string) => {
    const registry = getRegistryForPackage(registries, packageName, registryUrl);
    const url = `${registry.uri.replace(/\/+$/, '')}/${packageName.replace('/', '%2f')}/${encodeURIComponent(version)}`;
    try {
      const fetcher = await getFetcher(registry.uri);
      const response = await fetcher(url, {
        headers: registry.authHeaderValue ? { authorization: registry.authHeaderValue } : {},
        signal: AbortSignal.timeout(REGISTRY_REQUEST_TIMEOUT),
      });
      await response.text().catch(() => undefined); // release the connection, the body is not needed
      if (response.ok) return true;
      if (response.status !== 404) {
        // an unreachable or unauthenticated registry can't tell us the version is taken. treated as
        // "not published" on purpose: only a positive answer is allowed to move a version forward.
        logger.debug(`got ${response.status} when asking ${url} whether ${version} is published`);
      }
      return false;
    } catch (err: any) {
      logger.debug(`failed asking ${url} whether ${version} is published: ${err.message}`);
      return false;
    }
  };
}

/**
 * `registryUrl` is where the publish is actually going for this component, so it wins over the
 * registry configured for the package's scope.
 */
export function getRegistryForPackage(
  registries: Registries,
  packageName: string,
  registryUrl?: string
): Pick<Registry, 'uri' | 'authHeaderValue'> {
  const scope = packageName.startsWith('@') ? packageName.slice(1).split('/')[0] : undefined;
  const byScope = (scope && registries.scopes[scope]) || registries.defaultRegistry;
  if (!registryUrl || isSameRegistry(registryUrl, byScope.uri)) return byScope;
  return { uri: registryUrl, authHeaderValue: findAuthHeaderForUrl(registries, registryUrl) };
}

/**
 * npmrc keys its credentials by url prefix (`//host/path/:_authToken`), and bit's registry model
 * carries them on the entries it knows about. so the credential for an explicit publish registry is
 * the one from the entry that covers its url: the very same url, or the closest one above it.
 *
 * a url no entry covers is probed without authorization. a private version then reads as free,
 * which leaves the publish to fail exactly as it does without this check - never a wrong version.
 */
function findAuthHeaderForUrl(registries: Registries, registryUrl: string): string | undefined {
  const target = toUrl(registryUrl);
  if (!target) return undefined;
  const covering = [registries.defaultRegistry, ...Object.values(registries.scopes)]
    .flatMap((registry) => {
      const uri = registry.authHeaderValue ? toUrl(registry.uri) : undefined;
      return uri && covers(uri, target) ? [{ registry, uri }] : [];
    })
    // the most specific path wins, the way npm resolves the nearest matching npmrc key
    .sort((a, b) => b.uri.pathname.length - a.uri.pathname.length);
  return covering[0]?.registry.authHeaderValue;
}

/**
 * the same origin, so a credential never crosses to another host or protocol, and the target path
 * is the registry's path or nested under it: `/npm/` covers `/npm/internal/` but not `/npm-private/`.
 */
function covers(registry: URL, target: URL): boolean {
  if (registry.origin !== target.origin) return false;
  return withTrailingSlash(target.pathname).startsWith(withTrailingSlash(registry.pathname));
}

function withTrailingSlash(path: string): string {
  return path.endsWith('/') ? path : `${path}/`;
}

function toUrl(uri: string): URL | undefined {
  try {
    return new URL(uri);
  } catch {
    return undefined;
  }
}

/**
 * the case of the scheme and host and a trailing slash don't make a different registry. the path
 * does, in its exact case, like in any url.
 */
function isSameRegistry(a: string, b: string): boolean {
  const normalize = (uri: string) => {
    const url = toUrl(uri);
    return (url ? `${url.origin}${url.pathname}` : uri).replace(/\/+$/, '');
  };
  return normalize(a) === normalize(b);
}
