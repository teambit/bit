import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import { LaneId } from '@teambit/lane-id';
import type { LaneData } from '@teambit/legacy.scope';
import type { CiSyncConfig } from './sync-config';
import { resolveSyncConfig } from './sync-config';
import type { LaneDiscoveryIO } from './lane-discovery';
import {
  dedupeAndSortTargets,
  discoverLaneTargets,
  displayTarget,
  expandLaneScopes,
  laneTargetId,
  selectLaneTargets,
  targetForBranch,
} from './lane-discovery';

const DESIGN = 'acme.design';
const PLATFORM = 'acme.platform';
const STORE = 'acme.store';

/** A lane as `LanesMain.getLanes({ remote })` answers: an id plus its component ids. */
function lane(hostScope: string, name: string, componentScopes: string[]): LaneData {
  return {
    id: LaneId.from(name, hostScope),
    name,
    components: componentScopes.map((scope, i) => ({
      id: ComponentID.fromObject({ scope, name: `comp-${i}`, version: 'a'.repeat(40) }),
      head: 'a'.repeat(40),
    })),
  } as unknown as LaneData;
}

const ids = (targets: Array<{ hostScope: string; name: string }>) => targets.map(laneTargetId);

describe('expandLaneScopes', () => {
  const owners: Record<string, string[]> = {
    acme: [STORE, DESIGN, PLATFORM, 'acme.team-a', 'acme.team-b'],
  };
  const listOwnerScopes = async (owner: string) => {
    if (!owners[owner]) throw new Error(`no such owner ${owner}`);
    return owners[owner];
  };

  it('scans defaultScope alone by default (unchanged behavior) and never asks bit.cloud for scopes', async () => {
    let called = false;
    const result = await expandLaneScopes([], DESIGN, async () => {
      called = true;
      return [];
    });
    expect(result).to.deep.equal({ scopes: [DESIGN], errors: [] });
    expect(called).to.equal(false);
  });

  it('adds literal scope ids as given, defaultScope first and without duplicates', async () => {
    const result = await expandLaneScopes([PLATFORM, DESIGN, 'other.scope'], DESIGN, listOwnerScopes);
    expect(result.scopes).to.deep.equal([DESIGN, PLATFORM, 'other.scope']);
  });

  it('expands an owner wildcard over the owner scope list', async () => {
    const result = await expandLaneScopes(['acme.*'], DESIGN, listOwnerScopes);
    expect(result.scopes).to.deep.equal([DESIGN, PLATFORM, STORE, 'acme.team-a', 'acme.team-b']);
  });

  it('applies a partial wildcard, listing each owner once for several patterns', async () => {
    let calls = 0;
    const result = await expandLaneScopes(['acme.team-*', 'acme.plat*'], DESIGN, async (owner) => {
      calls += 1;
      return listOwnerScopes(owner);
    });
    expect(result.scopes).to.deep.equal([DESIGN, PLATFORM, 'acme.team-a', 'acme.team-b']);
    expect(calls).to.equal(1);
  });

  it('reports an owner it cannot list and keeps the rest', async () => {
    const result = await expandLaneScopes(['nobody.*', PLATFORM], DESIGN, listOwnerScopes);
    expect(result.scopes).to.deep.equal([DESIGN, PLATFORM]);
    expect(result.errors).to.have.length(1);
    expect(result.errors[0]).to.include('owner "nobody"').and.include('no such owner nobody');
  });
});

describe('selectLaneTargets', () => {
  it('keeps every lane defaultScope hosts, even one without own components (the executor reports it)', () => {
    const targets = selectLaneTargets(
      [{ scope: DESIGN, lanes: [lane(DESIGN, 'own', [DESIGN]), lane(DESIGN, 'foreign-only', [STORE])] }],
      DESIGN
    );
    expect(ids(targets)).to.deep.equal([`${DESIGN}/own`, `${DESIGN}/foreign-only`]);
  });

  it('keeps a lane hosted elsewhere only when it carries a defaultScope component', () => {
    const targets = selectLaneTargets(
      [
        {
          scope: PLATFORM,
          lanes: [
            lane(PLATFORM, 'org-scale-content', [PLATFORM, DESIGN, STORE]),
            lane(PLATFORM, 'platform-only', [PLATFORM]),
            lane(PLATFORM, 'main', [PLATFORM]),
          ],
        },
      ],
      DESIGN
    );
    expect(ids(targets)).to.deep.equal([`${PLATFORM}/org-scale-content`]);
  });

  it('takes the host from the lane id, not from the scope that was asked', () => {
    const targets = selectLaneTargets([{ scope: PLATFORM, lanes: [lane(STORE, 'x', [DESIGN])] }], DESIGN);
    expect(ids(targets)).to.deep.equal([`${STORE}/x`]);
  });
});

describe('targetForBranch — resolving a lane-mapped branch through its .bitmap pointer', () => {
  it('resolves against the foreign host its pointer names (a live or an archived foreign lane)', () => {
    expect(targetForBranch('org-scale-content', `${PLATFORM}/org-scale-content`, DESIGN)).to.deep.equal({
      hostScope: PLATFORM,
      name: 'org-scale-content',
    });
  });

  it('resolves against defaultScope with no pointer (the previous behavior)', () => {
    expect(targetForBranch('my-lane', undefined, DESIGN)).to.deep.equal({ hostScope: DESIGN, name: 'my-lane' });
  });

  it('ignores a pointer at a DIFFERENT lane name — inherited from a merged sync PR, it attributes nothing', () => {
    expect(targetForBranch('feature-x', `${PLATFORM}/other-lane`, DESIGN)).to.deep.equal({
      hostScope: DESIGN,
      name: 'feature-x',
    });
  });

  it('ignores an unparsable pointer', () => {
    expect(targetForBranch('my-lane', 'a/b/c', DESIGN)).to.deep.equal({ hostScope: DESIGN, name: 'my-lane' });
  });
});

describe('dedupeAndSortTargets / displayTarget', () => {
  it('deduplicates on hostScope/name and orders by name, then host', () => {
    const targets = dedupeAndSortTargets([
      { hostScope: PLATFORM, name: 'b' },
      { hostScope: DESIGN, name: 'b' },
      { hostScope: DESIGN, name: 'a' },
      { hostScope: PLATFORM, name: 'b' },
    ]);
    expect(ids(targets)).to.deep.equal([`${DESIGN}/a`, `${DESIGN}/b`, `${PLATFORM}/b`]);
  });

  it('shows defaultScope lanes bare and foreign ones scope-qualified', () => {
    expect(displayTarget({ hostScope: DESIGN, name: 'a' }, DESIGN)).to.equal('a');
    expect(displayTarget({ hostScope: PLATFORM, name: 'a' }, DESIGN)).to.equal(`${PLATFORM}/a`);
  });
});

describe('discoverLaneTargets', () => {
  type Fixture = {
    config?: CiSyncConfig;
    scopeLanes?: Record<string, LaneData[] | Error>;
    ownerScopes?: Record<string, string[]>;
    branches?: string[] | Error;
    pointers?: Record<string, string>;
  };

  async function discover(fixture: Fixture) {
    const asked: string[] = [];
    const pointerReads: string[] = [];
    const io: LaneDiscoveryIO = {
      listScopeLanes: async (scope) => {
        asked.push(scope);
        const answer = fixture.scopeLanes?.[scope];
        if (answer instanceof Error) throw answer;
        if (!answer) throw new Error(`lanes of scope ${scope} were not found`);
        return answer;
      },
      listOwnerScopes: async (owner) => fixture.ownerScopes?.[owner] ?? [],
      listBranches: async () => {
        if (fixture.branches instanceof Error) throw fixture.branches;
        return fixture.branches ?? [];
      },
      readBranchPointer: async (branch) => {
        pointerReads.push(branch);
        return fixture.pointers?.[branch];
      },
      warn: () => {},
      debug: () => {},
    };
    const result = await discoverLaneTargets(io, {
      cfg: resolveSyncConfig(fixture.config),
      defaultScope: DESIGN,
      defaultBranch: 'master',
      mainLaneName: 'main',
    });
    return { ...result, ids: ids(result.targets), asked: asked.sort(), pointerReads };
  }

  it('without laneScopes, lists only defaultScope — a foreign lane is invisible (the reported gap)', async () => {
    const { ids: found, asked } = await discover({
      scopeLanes: { [DESIGN]: [], [PLATFORM]: [lane(PLATFORM, 'org-scale-content', [PLATFORM, DESIGN])] },
    });
    expect(asked).to.deep.equal([DESIGN]);
    expect(found).to.deep.equal([]);
  });

  it('with an owner wildcard, finds a foreign-hosted lane carrying this scope and skips one that does not', async () => {
    const {
      ids: found,
      asked,
      errors,
    } = await discover({
      config: { laneScopes: ['acme.*'] },
      ownerScopes: { acme: [DESIGN, PLATFORM, STORE] },
      scopeLanes: {
        [DESIGN]: [lane(DESIGN, 'main', [DESIGN]), lane(DESIGN, 'home-lane', [DESIGN])],
        [PLATFORM]: [
          // a remote's listing includes its main lane, which may cache other scopes' components
          lane(PLATFORM, 'main', [PLATFORM, DESIGN]),
          lane(PLATFORM, 'org-scale-content', [PLATFORM, DESIGN, STORE]),
          lane(PLATFORM, 'platform-only', [PLATFORM, STORE]),
        ],
        // STORE has no lanes: the remote answers "not found", which is not an error
      },
    });
    expect(asked).to.deep.equal([DESIGN, PLATFORM, STORE]);
    expect(found).to.deep.equal([`${DESIGN}/home-lane`, `${PLATFORM}/org-scale-content`]);
    expect(errors).to.deep.equal([]);
  });

  it('still filters foreign lanes by the lanes name patterns', async () => {
    const { ids: found } = await discover({
      config: { laneScopes: [PLATFORM], lanes: ['feature-*'] },
      scopeLanes: {
        [DESIGN]: [],
        [PLATFORM]: [lane(PLATFORM, 'feature-a', [DESIGN]), lane(PLATFORM, 'org-scale-content', [DESIGN])],
      },
    });
    expect(found).to.deep.equal([`${PLATFORM}/feature-a`]);
  });

  it('resolves a lane-mapped branch against the foreign host its .bitmap names, even without laneScopes', async () => {
    // The foreign lane was archived after release: no scope lists it any more, and only the branch's
    // pointer can route the run to it, so `close-pr` fires against the right lane id.
    const { ids: found } = await discover({
      scopeLanes: { [DESIGN]: [] },
      branches: ['master', 'bit-sync/main', 'org-scale-content'],
      pointers: { 'org-scale-content': `${PLATFORM}/org-scale-content` },
    });
    expect(found).to.deep.equal([`${PLATFORM}/org-scale-content`]);
  });

  it('merges the branch side and the lane side of the same foreign lane into one target', async () => {
    const { ids: found } = await discover({
      config: { laneScopes: [PLATFORM] },
      scopeLanes: { [DESIGN]: [], [PLATFORM]: [lane(PLATFORM, 'org-scale-content', [DESIGN])] },
      branches: ['org-scale-content'],
      pointers: { 'org-scale-content': `${PLATFORM}/org-scale-content` },
    });
    expect(found).to.deep.equal([`${PLATFORM}/org-scale-content`]);
  });

  it('resolves a branch with no pointer, or an inherited pointer at another lane, against defaultScope', async () => {
    const { ids: found } = await discover({
      scopeLanes: { [DESIGN]: [] },
      branches: ['fresh', 'cut-after-merge'],
      pointers: { 'cut-after-merge': `${PLATFORM}/org-scale-content` },
    });
    expect(found).to.deep.equal([`${DESIGN}/cut-after-merge`, `${DESIGN}/fresh`]);
  });

  it('keeps two different same-named lanes apart (the executor refuses the one not owning the branch)', async () => {
    const { ids: found } = await discover({
      config: { laneScopes: [PLATFORM] },
      scopeLanes: { [DESIGN]: [lane(DESIGN, 'shared', [DESIGN])], [PLATFORM]: [lane(PLATFORM, 'shared', [DESIGN])] },
    });
    expect(found).to.deep.equal([`${DESIGN}/shared`, `${PLATFORM}/shared`]);
  });

  it('reads no pointer for branches the lanes filter drops', async () => {
    const { pointerReads } = await discover({
      config: { branchPrefix: 'lane/', lanes: ['keep-*'] },
      scopeLanes: { [DESIGN]: [] },
      branches: ['master', 'feature/x', 'lane/keep-1', 'lane/drop-1', 'lane/main'],
    });
    expect(pointerReads).to.deep.equal(['lane/keep-1']);
  });

  it('reports a scope it cannot list as HALTED and still reconciles everything else', async () => {
    const { ids: found, errors } = await discover({
      config: { laneScopes: [PLATFORM, STORE] },
      scopeLanes: {
        [DESIGN]: [lane(DESIGN, 'home-lane', [DESIGN])],
        [PLATFORM]: new Error('access denied'),
        [STORE]: [lane(STORE, 'store-lane', [DESIGN])],
      },
      branches: ['x'],
    });
    expect(found).to.deep.equal([`${DESIGN}/home-lane`, `${STORE}/store-lane`, `${DESIGN}/x`].sort(byName));
    expect(errors).to.have.length(1);
    expect(errors[0]).to.match(/^HALTED lanes -> could not list the lanes of acme\.platform: .*access denied/);
  });

  it('reports a failed branch listing as HALTED and keeps the listed lanes', async () => {
    const { ids: found, errors } = await discover({
      scopeLanes: { [DESIGN]: [lane(DESIGN, 'home-lane', [DESIGN])] },
      branches: new Error('ls-remote failed'),
    });
    expect(found).to.deep.equal([`${DESIGN}/home-lane`]);
    expect(errors[0]).to.include('could not list the branches of "origin"').and.include('ls-remote failed');
  });
});

/** Order two `hostScope/name` ids the way `dedupeAndSortTargets` does: by name, then host. */
function byName(a: string, b: string): number {
  const [hostA, nameA] = a.split('/');
  const [hostB, nameB] = b.split('/');
  return nameA.localeCompare(nameB) || hostA.localeCompare(hostB);
}
