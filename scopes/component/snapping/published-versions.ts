import { SemVer } from 'semver';
import { getFetcherWithAgent } from '@teambit/scope.network';
import { BitError } from '@teambit/bit-error';
import { pMapPool } from '@teambit/toolbox.promise.map-pool';
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

/**
 * every candidate is checked, rather than a sample of them: a publish that failed midway (npm rate
 * limiting is the usual reason) leaves only *some* of the components published, so there is no
 * component whose answer can be taken to hold for the rest. it is cheap enough to be thorough -
 * measured against registry.npmjs.org, 400 checks take ~11s, against a merge job that runs for
 * close to an hour.
 */
export const REGISTRY_CHECK_CONCURRENCY = 16;

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
  isTakenLocally?: (version: string) => boolean;
};

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
 * return `version`, or - when it was already published to the registry - the next version that
 * wasn't. `isTakenLocally` keeps the result clear of versions the local model already has, so a
 * skip can't land on an existing tag.
 */
export async function findVersionNotPublished({
  packageName,
  version,
  registryUrl,
  isPublished,
  isTakenLocally,
  maxToSkip = MAX_PUBLISHED_VERSIONS_TO_SKIP,
}: {
  packageName: string;
  version: string;
  registryUrl?: string;
  isPublished: IsVersionPublished;
  isTakenLocally?: (version: string) => boolean;
  maxToSkip?: number;
}): Promise<string> {
  let candidate = version;
  for (let skipped = 0; skipped <= maxToSkip; skipped += 1) {
    const isTaken = isTakenLocally?.(candidate) || (await isPublished(packageName, candidate, registryUrl));
    if (!isTaken) return candidate;
    candidate = getNextVersion(candidate);
  }
  throw new BitError(
    `unable to find an unpublished version for ${packageName}, the ${maxToSkip} versions following ${version} are all in the registry.
this is unlikely to be a stuck release. make sure the package name is correct and that the registry is not returning stale data`
  );
}

/**
 * resolve the version to tag for each candidate.
 *
 * @returns the candidates whose version changed, by component id.
 */
export async function skipPublishedVersions({
  candidates,
  isPublished,
  concurrency = REGISTRY_CHECK_CONCURRENCY,
  onSkip,
}: {
  candidates: VersionCandidate[];
  isPublished: IsVersionPublished;
  concurrency?: number;
  onSkip?: (candidate: VersionCandidate, versionToTag: string) => void;
}): Promise<Map<string, string>> {
  const skipped = new Map<string, string>();
  if (!candidates.length) return skipped;
  await pMapPool(
    candidates,
    async (candidate: VersionCandidate) => {
      const versionToTag = await findVersionNotPublished({
        packageName: candidate.packageName,
        version: candidate.version,
        registryUrl: candidate.registryUrl,
        isPublished,
        isTakenLocally: candidate.isTakenLocally,
      });
      if (versionToTag === candidate.version) return;
      skipped.set(candidate.id, versionToTag);
      onSkip?.(candidate, versionToTag);
    },
    { concurrency }
  );
  return skipped;
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
  const fetcherPerRegistry = new Map<string, Promise<Fetcher>>();
  const getFetcher = (uri: string): Promise<Fetcher> => {
    const existing = fetcherPerRegistry.get(uri);
    if (existing) return existing;
    const fetcher = getFetcherWithAgent(uri);
    fetcherPerRegistry.set(uri, fetcher);
    return fetcher;
  };

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

type Fetcher = Awaited<ReturnType<typeof getFetcherWithAgent>>;

/**
 * `registryUrl` is where the publish is actually going for this component, so it wins over the
 * registry configured for the package's scope. its credentials are whatever the npmrc holds for
 * that same url - when it holds none, the probe is unauthenticated and a private version reads as
 * free, which is no worse than not checking at all.
 */
function getRegistryForPackage(
  registries: Registries,
  packageName: string,
  registryUrl?: string
): Pick<Registry, 'uri' | 'authHeaderValue'> {
  const scope = packageName.startsWith('@') ? packageName.slice(1).split('/')[0] : undefined;
  const byScope = (scope && registries.scopes[scope]) || registries.defaultRegistry;
  if (!registryUrl || isSameRegistry(registryUrl, byScope.uri)) return byScope;
  const configured = [registries.defaultRegistry, ...Object.values(registries.scopes)].find((registry) =>
    isSameRegistry(registryUrl, registry.uri)
  );
  return { uri: registryUrl, authHeaderValue: configured?.authHeaderValue };
}

function isSameRegistry(a: string, b: string): boolean {
  const normalize = (uri: string) => uri.replace(/\/+$/, '').toLowerCase();
  return normalize(a) === normalize(b);
}
