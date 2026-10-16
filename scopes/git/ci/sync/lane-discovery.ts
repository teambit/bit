import type { LaneData } from '@teambit/legacy.scope';
import { pMapPool } from '@teambit/toolbox.promise.map-pool';
import type { CiSyncConfig, LaneTarget } from './sync-config';
import {
  branchToLaneName,
  laneScopePatternOwner,
  parseLaneTarget,
  scopeMatchesPattern,
  shouldSyncLane,
  syncableLaneNameForBranch,
} from './sync-config';
import { HALT_SUMMARY_PREFIX } from './lane-sync-executor';

/** How many scopes' lanes an `--all` run lists at once — each is one GraphQL request to that scope. */
export const LANE_LISTING_CONCURRENCY = 5;

/**
 * Which lanes an `--all` run visits. One repository mirrors one scope (`defaultScope`), but a lane is
 * hosted on ONE scope and may carry components of many: a lane hosted elsewhere that carries this
 * repository's components is as much this repository's business as one hosted on `defaultScope`.
 * bit.cloud has no reverse index ("lanes touching scope X") — a lane's objects live only on its host
 * scope, and the hub's lane search filters by host scope — so discovery is "list the lanes of every
 * configured scope, keep those carrying a `defaultScope` component".
 */

/** The lanes one scope answered with. */
export type ScopeLaneListing = { scope: string; lanes: LaneData[] };

/** `hostScope/name` — the identity two targets are deduplicated on. */
export function laneTargetId(target: LaneTarget): string {
  return `${target.hostScope}/${target.name}`;
}

/**
 * The scopes whose lanes this run lists: `defaultScope` first, then every `laneScopes` entry —
 * literal ids as given, wildcards expanded over their owner's scopes through `listOwnerScopes` (one
 * call per distinct owner, whatever the number of patterns). An owner whose scopes cannot be listed
 * yields one error line and contributes nothing; the other entries are still scanned.
 */
export async function expandLaneScopes(
  patterns: string[],
  defaultScope: string,
  listOwnerScopes: (owner: string) => Promise<string[]>
): Promise<{ scopes: string[]; errors: string[] }> {
  const scopes = new Set<string>([defaultScope]);
  const errors: string[] = [];
  const wildcardsByOwner = new Map<string, string[]>();
  patterns.forEach((pattern) => {
    if (!pattern.includes('*')) {
      scopes.add(pattern);
      return;
    }
    // validated by resolveSyncConfig: a wildcard always has a literal owner
    const owner = laneScopePatternOwner(pattern) as string;
    wildcardsByOwner.set(owner, [...(wildcardsByOwner.get(owner) ?? []), pattern]);
  });
  for (const [owner, ownerPatterns] of wildcardsByOwner) {
    try {
      // oxlint-disable-next-line no-await-in-loop
      const ownerScopes = await listOwnerScopes(owner);
      ownerScopes
        .filter((scope) => ownerPatterns.some((pattern) => scopeMatchesPattern(scope, pattern)))
        .sort()
        .forEach((scope) => scopes.add(scope));
    } catch (e: any) {
      errors.push(
        `could not list the scopes of owner "${owner}" to expand sync.laneScopes ${JSON.stringify(ownerPatterns)}: ` +
          `${e?.message || e}`
      );
    }
  }
  return { scopes: [...scopes], errors };
}

/**
 * The lane targets the listings contribute. Every lane `defaultScope` hosts is kept (unchanged
 * behavior: a lane with no own-scope components is reported by the executor, not hidden here). A lane
 * hosted elsewhere is kept only when it carries at least one `defaultScope` component — the slice this
 * repository mirrors; without one there is nothing to mirror and visiting it would only print a skip.
 * The host is read off the lane's own id, not the scope that was asked.
 */
export function selectLaneTargets(listings: ScopeLaneListing[], defaultScope: string): LaneTarget[] {
  const targets: LaneTarget[] = [];
  listings.forEach(({ scope, lanes }) => {
    lanes.forEach((lane) => {
      const name = lane.id?.name ?? lane.name;
      if (!name) return;
      const hostScope = lane.id?.scope || scope;
      if (hostScope === defaultScope) {
        targets.push({ hostScope, name });
        return;
      }
      const carriesOwnComponent = (lane.components ?? []).some((comp) => comp.id.scope === defaultScope);
      if (carriesOwnComponent) targets.push({ hostScope, name });
    });
  });
  return targets;
}

/**
 * The lane a lane-mapped branch is reconciled against. A branch name carries no scope, but the branch's
 * committed `.bitmap` does: when its lane pointer names a lane with the branch's lane NAME, that
 * pointer's host scope is the lane this branch mirrors — so a foreign-hosted lane that was archived is
 * still found (and its PR closed), and a live one is not mistaken for "lane gone". Any other pointer
 * (none, unparsable, or another lane's — inherited from a merged sync PR) resolves against
 * `defaultScope`, as before. The pointer only chooses WHERE to look; whether the branch may be touched
 * is still decided by the executor's full ownership evidence.
 */
export function targetForBranch(
  laneName: string,
  pointerLaneIdStr: string | undefined,
  defaultScope: string
): LaneTarget {
  if (pointerLaneIdStr) {
    try {
      const pointer = parseLaneTarget(pointerLaneIdStr, defaultScope);
      if (pointer.name === laneName) return pointer;
    } catch {
      // an unparsable pointer attributes nothing
    }
  }
  return { hostScope: defaultScope, name: laneName };
}

/**
 * Deduplicate by `hostScope/name` and order by name, then host — the branch side and the lane side
 * usually name the same lane. Two DIFFERENT lanes sharing a name both stay: they map to one branch,
 * and the executor's "two lanes, one branch" guard refuses the one that does not own it, loudly.
 */
export function dedupeAndSortTargets(targets: LaneTarget[]): LaneTarget[] {
  const byId = new Map<string, LaneTarget>();
  targets.forEach((target) => byId.set(laneTargetId(target), target));
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name) || a.hostScope.localeCompare(b.hostScope));
}

/** How a target is named in the `--all` title: bare for `defaultScope`, scope-qualified otherwise. */
export function displayTarget(target: LaneTarget, defaultScope: string): string {
  return target.hostScope === defaultScope ? target.name : laneTargetId(target);
}

/** Every side effect lane discovery needs, injected so the whole enumeration is unit-testable. */
export type LaneDiscoveryIO = {
  /** The lanes a remote scope hosts; rejects like `LanesMain.getLanes({ remote })` ("…not found" = none). */
  listScopeLanes: (scope: string) => Promise<LaneData[]>;
  /** bit.cloud's scope list for an owner — only called for wildcard `laneScopes`. */
  listOwnerScopes: (owner: string) => Promise<string[]>;
  /** The branches `origin` has, by short name. */
  listBranches: () => Promise<string[]>;
  /** The scope-qualified lane id `origin/<branch>`'s committed `.bitmap` points at, if any. Must not throw. */
  readBranchPointer: (branch: string) => Promise<string | undefined>;
  warn: (message: string) => void;
  debug: (message: string) => void;
};

export type LaneDiscoveryContext = {
  cfg: Required<CiSyncConfig>;
  defaultScope: string;
  defaultBranch: string;
  mainLaneName: string;
};

/**
 * The lanes an `--all` run reconciles (sorted by name, then host), plus one HALTED line per enumeration
 * failure. The union of two sources:
 *
 * 1. The lanes of `defaultScope` and of every `sync.laneScopes` scope; a lane hosted elsewhere is kept
 *    only when it carries a `defaultScope` component (`selectLaneTargets`).
 * 2. The lane-mapped branches on `origin`, each resolved against the lane its committed `.bitmap` points
 *    at (`targetForBranch`). A lane deleted on bit.cloud is gone from the first source, and only the
 *    branch side can make `close-pr` fire for it — including a foreign-hosted lane.
 *
 * A failure is reported rather than thrown, so whatever did enumerate is still reconciled while the run
 * exits non-zero.
 */
export async function discoverLaneTargets(
  io: LaneDiscoveryIO,
  { cfg, defaultScope, defaultBranch, mainLaneName }: LaneDiscoveryContext
): Promise<{ targets: LaneTarget[]; errors: string[] }> {
  const errors: string[] = [];
  const targets: LaneTarget[] = [];
  const syncable = (name: string) => name !== mainLaneName && shouldSyncLane(name, cfg);

  const { scopes, errors: scopeErrors } = await expandLaneScopes(cfg.laneScopes, defaultScope, io.listOwnerScopes);
  errors.push(...scopeErrors.map((error) => `${HALT_SUMMARY_PREFIX} lanes -> ${error}`));
  if (scopes.length > 1) io.debug(`bit ci sync: listing the lanes of ${scopes.length} scope(s): ${scopes.join(', ')}`);

  const listings = await pMapPool(
    scopes,
    async (scope): Promise<ScopeLaneListing> => {
      try {
        return { scope, lanes: await io.listScopeLanes(scope) };
      } catch (e: any) {
        const msg = e?.toString() ?? '';
        // A scope with no lanes at all: the remote answers "not found" rather than an empty list.
        if (msg.includes('not found')) {
          if (scope === defaultScope) {
            io.warn(`No lanes found on ${scope} — reconciling lane-mapped branches and the main scope only`);
          }
        } else {
          errors.push(`${HALT_SUMMARY_PREFIX} lanes -> could not list the lanes of ${scope}: ${msg}`);
        }
        return { scope, lanes: [] };
      }
    },
    { concurrency: LANE_LISTING_CONCURRENCY }
  );
  targets.push(...selectLaneTargets(listings, defaultScope));

  try {
    for (const branch of await io.listBranches()) {
      // Reconciled by the main-scope path, never as lanes — under the default `branchPrefix: ''` they
      // would otherwise resolve to the bogus lanes "main" / "bit-sync/main".
      if (branch === defaultBranch || branch === cfg.mainSyncBranch) continue;
      // Ordinary developer branches are skipped at debug level, never as a summary line.
      const laneName = syncableLaneNameForBranch(branch, cfg);
      if (!laneName) {
        io.debug(
          `bit ci sync: branch "${branch}" does not map to a name any lane could have ` +
            `(mapped to "${branchToLaneName(branch, cfg) ?? '<not lane-mapped>'}") — skipping it`
        );
        continue;
      }
      // Skip the `.bitmap` read for a name the final filter drops anyway.
      if (!syncable(laneName)) continue;
      // oxlint-disable-next-line no-await-in-loop
      const pointer = await io.readBranchPointer(branch);
      targets.push(targetForBranch(laneName, pointer, defaultScope));
    }
  } catch (e: any) {
    errors.push(
      `${HALT_SUMMARY_PREFIX} lanes -> could not list the branches of "origin", so a lane deleted on ` +
        `bit.cloud may have kept an orphan branch and an open PR: ${e?.message || e}`
    );
  }

  return { targets: dedupeAndSortTargets(targets).filter((target) => syncable(target.name)), errors };
}
