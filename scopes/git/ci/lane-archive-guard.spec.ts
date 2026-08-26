import { expect } from 'chai';
import { decideLaneArchive, laneArchiveDecision, sameReleasedState } from './lane-archive-guard';
import type { ForeignLaneComponent } from './lane-archive-guard';

describe('decideLaneArchive', () => {
  const LANE = 'acme.cards/feature';
  const SCOPE = 'acme.cards';
  const foreign = (id: string, released: boolean | undefined, scope = 'acme.payments'): ForeignLaneComponent => ({
    id,
    scope,
    released,
  });

  it('archives a lane that holds components of this scope only, silently', () => {
    expect(decideLaneArchive(LANE, SCOPE, [])).to.deep.equal({ archive: true, summary: '' });
  });

  it('archives once every foreign component is on its main, and says so', () => {
    const decision = decideLaneArchive(LANE, SCOPE, [
      foreign('acme.payments/ui/table', true),
      foreign('acme.docs/ui/note', true, 'acme.docs'),
    ]);
    expect(decision.archive).to.be.true;
    expect(decision.summary).to.include('All 2 component(s) outside this release (scope(s) acme.docs, acme.payments)');
  });

  it('keeps the lane open while a foreign component is not on its main, naming it and the way out', () => {
    const decision = decideLaneArchive(LANE, SCOPE, [
      foreign('acme.payments/ui/table', true),
      foreign('acme.payments/ui/row', false),
    ]);
    expect(decision.archive).to.be.false;
    expect(decision.summary).to.include(`Lane ${LANE} left open.`);
    expect(decision.summary).to.include(
      '1 component(s) from scope(s) acme.payments are not on their main yet: acme.payments/ui/row.'
    );
    expect(decision.summary).to.not.include('ui/table');
    expect(decision.summary).to.include(`releases the ${SCOPE} slice only`);
    expect(decision.summary).to.include(`bit lane remove --remote ${LANE}`);
  });

  it('keeps the lane open when a foreign state could not be read, rather than guessing', () => {
    const decision = decideLaneArchive(LANE, SCOPE, [foreign('acme.payments/ui/table', undefined)]);
    expect(decision.archive).to.be.false;
    expect(decision.summary).to.include('could not be read: acme.payments/ui/table.');
    expect(decision.summary).to.not.include('not on their main yet');
  });

  it('names at most five components and counts the rest', () => {
    const many = Array.from({ length: 7 }, (_, i) => foreign(`acme.payments/ui/comp${i}`, false));
    const decision = decideLaneArchive(LANE, SCOPE, many);
    expect(decision.summary).to.include('acme.payments/ui/comp4 and 2 more.');
    expect(decision.summary).to.not.include('comp5');
  });
});

describe('laneArchiveDecision', () => {
  const laneId = { scope: 'acme.cards', name: 'feature', toString: () => 'acme.cards/feature' } as any;
  const noop = async () => {};
  const deps = (overrides: Partial<Parameters<typeof laneArchiveDecision>[2]>) =>
    ({
      readLane: async () => undefined,
      importMainObjects: noop,
      getModelComponent: async () => undefined,
      importObjectsByHashes: noop,
      releasedHeadByThisRun: () => undefined,
      objects: {} as any,
      warn: () => {},
      ...overrides,
    }) as Parameters<typeof laneArchiveDecision>[2];
  const snapshot = (components: any[], updateDependents: any[] = []) => ({ components, updateDependents }) as any;
  const foreignEntry = {
    id: { scope: 'acme.payments', changeVersion: () => ({}), toStringWithoutVersion: () => 'acme.payments/ui/table' },
    head: 'abc',
  };

  it('archives, silently, a lane the remote no longer has', async () => {
    const decision = await laneArchiveDecision(laneId, 'acme.cards', deps({ readLane: async () => undefined }));
    expect(decision).to.deep.equal({ archive: true, summary: '' });
  });

  it('keeps the lane open on a read error that merely mentions "not found"', async () => {
    // an object-fetch or decoding failure is not proof that the lane is gone
    const decision = await laneArchiveDecision(
      laneId,
      'acme.cards',
      deps({ readLane: async () => Promise.reject(new Error('object abc123 not found')) })
    );
    expect(decision.archive).to.be.false;
    expect(decision.summary).to.include('object abc123 not found');
  });

  it('keeps the lane open when the remote cannot be read for another reason', async () => {
    const decision = await laneArchiveDecision(
      laneId,
      'acme.cards',
      deps({ readLane: async () => Promise.reject(new Error('ECONNRESET')) })
    );
    expect(decision.archive).to.be.false;
    expect(decision.summary).to.include('Could not read lane acme.cards/feature');
    expect(decision.summary).to.include('ECONNRESET');
    expect(decision.summary).to.include('bit lane remove --remote acme.cards/feature');
  });

  it('keeps the lane open when the foreign main history cannot be fetched, and says whose', async () => {
    const warnings: string[] = [];
    const decision = await laneArchiveDecision(
      laneId,
      'acme.cards',
      deps({
        readLane: async () => snapshot([foreignEntry]),
        importMainObjects: async () => Promise.reject(new Error('no route to acme.payments')),
        warn: (m) => warnings.push(m),
      })
    );
    expect(decision.archive).to.be.false;
    expect(decision.summary).to.include('could not be read: acme.payments/ui/table.');
    expect(warnings.join('\n')).to.include('no route to acme.payments');
  });

  it('does not count a component this run released if its lane head has moved since', async () => {
    // another writer exported to the lane after this run tagged from it; the entry is no longer what
    // this run released, so it goes through the on-main check like any other (here: no main → pending)
    const decision = await laneArchiveDecision(
      laneId,
      'acme.cards',
      deps({ readLane: async () => snapshot([foreignEntry]), releasedHeadByThisRun: () => 'an-older-head' })
    );
    expect(decision.archive).to.be.false;
  });

  it('counts a foreign component this run tagged and exported as released, and archives', async () => {
    // the one-repository, many-scopes shape: the repo holds components of several scopes and this
    // very run tagged and exported all of them — nothing else to wait for.
    const decision = await laneArchiveDecision(
      laneId,
      'acme.cards',
      deps({ readLane: async () => snapshot([foreignEntry]), releasedHeadByThisRun: () => foreignEntry.head })
    );
    expect(decision.archive).to.be.true;
    expect(decision.summary).to.include('All 1 component(s) outside this release (scope(s) acme.payments)');
  });

  it('checks a hidden dependent of this scope too, since no .bitmap lists it', async () => {
    const ownHidden = {
      id: { scope: 'acme.cards', toStringWithoutVersion: () => 'acme.cards/ui/row', changeVersion: () => ({}) },
      head: 'h1',
    };
    const pending = await laneArchiveDecision(
      laneId,
      'acme.cards',
      deps({ readLane: async () => snapshot([], [ownHidden]) })
    );
    expect(pending.archive).to.be.false;
    expect(pending.summary).to.include('A hidden dependent of acme.cards is released only by a run');
    const released = await laneArchiveDecision(
      laneId,
      'acme.cards',
      deps({ readLane: async () => snapshot([], [ownHidden]), releasedHeadByThisRun: () => 'h1' })
    );
    expect(released.archive).to.be.true;
  });

  it('counts a foreign component hidden in updateDependents as lane work too', async () => {
    const decision = await laneArchiveDecision(
      laneId,
      'acme.cards',
      deps({ readLane: async () => snapshot([], [foreignEntry]) })
    );
    expect(decision.archive).to.be.false;
    expect(decision.summary).to.include('not on their main yet: acme.payments/ui/table.');
  });

  it('counts a foreign component the lane deletes as pending until its main head is removed', async () => {
    const deleted = { ...foreignEntry, isDeleted: true };
    const model = { getHead: () => ({ toString: () => 'main-head' }), getHeadAsTagIfExist: () => '0.0.1' } as any;
    const mainHeadRemoved = (removed: boolean) => ({ load: async () => ({ isRemoved: () => removed }) }) as any;
    const pending = await laneArchiveDecision(
      laneId,
      'acme.cards',
      deps({
        readLane: async () => snapshot([deleted]),
        getModelComponent: async () => model,
        objects: mainHeadRemoved(false),
      })
    );
    expect(pending.archive).to.be.false;
    const released = await laneArchiveDecision(
      laneId,
      'acme.cards',
      deps({
        readLane: async () => snapshot([deleted]),
        getModelComponent: async () => model,
        objects: mainHeadRemoved(true),
      })
    );
    expect(released.archive).to.be.true;
  });

  it('treats a foreign component with no main yet as not released', async () => {
    const decision = await laneArchiveDecision(
      laneId,
      'acme.cards',
      deps({ readLane: async () => snapshot([foreignEntry]) })
    );
    expect(decision.archive).to.be.false;
    expect(decision.summary).to.include('not on their main yet: acme.payments/ui/table.');
  });
});

describe('sameReleasedState', () => {
  type Spec = {
    files?: Array<[string, string]>;
    mainFile?: string;
    packages?: Record<string, string>;
    deps?: string[];
    config?: Array<[string, Record<string, unknown>]>;
    data?: Array<[string, Record<string, unknown>]>;
  };
  const version = ({
    files = [['a.ts', '1']],
    mainFile = 'a.ts',
    packages = {},
    deps = [],
    config = [],
    data = [],
  }: Spec) => {
    const componentId = (id: string) => {
      const [name, ver] = id.split('@');
      return { toString: () => id, toStringWithoutVersion: () => name, version: ver };
    };
    const extensions = config.map(([stringId, cfg], i) => ({
      stringId,
      extensionId: stringId.startsWith('@')
        ? undefined
        : {
            toStringWithoutVersion: () => stringId.split('@')[0],
            toString: () => stringId,
            version: stringId.split('@')[1],
          },
      config: cfg,
      data: data[i]?.[1] ?? {},
    }));
    return {
      mainFile,
      files: files.map(([relativePath, hash]) => ({ relativePath, file: { toString: () => hash } })),
      packageDependencies: packages,
      devPackageDependencies: {},
      peerPackageDependencies: {},
      dependencies: { get: () => deps.map((d) => ({ id: componentId(d) })) },
      devDependencies: { get: () => [] },
      peerDependencies: { get: () => [] },
      extensions,
    } as any;
  };

  it('is true for the same sources, packages, dependencies and config, in any order', () => {
    const a = version({
      files: [
        ['a.ts', '1'],
        ['b.ts', '2'],
      ],
      packages: { lodash: '^4' },
      deps: ['acme.cards/x@0.0.1'],
      config: [['teambit.envs/envs', { env: 'node' }]],
    });
    const b = version({
      files: [
        ['b.ts', '2'],
        ['a.ts', '1'],
      ],
      packages: { lodash: '^4' },
      deps: ['acme.cards/x@0.0.1'],
      config: [['teambit.envs/envs', { env: 'node' }]],
    });
    expect(sameReleasedState(a, b, [], new Map())).to.be.true;
  });

  it('is false when a file differs, is missing, or is extra', () => {
    expect(sameReleasedState(version({ files: [['a.ts', '1']] }), version({ files: [['a.ts', '9']] }), [], new Map()))
      .to.be.false;
    expect(
      sameReleasedState(
        version({
          files: [
            ['a.ts', '1'],
            ['b.ts', '2'],
          ],
        }),
        version({ files: [['a.ts', '1']] }),
        [],
        new Map()
      )
    ).to.be.false;
    expect(
      sameReleasedState(
        version({ files: [['a.ts', '1']] }),
        version({
          files: [
            ['a.ts', '1'],
            ['b.ts', '2'],
          ],
        }),
        [],
        new Map()
      )
    ).to.be.false;
  });

  it('is false when only a package dependency, a component dependency version, or a config differs', () => {
    expect(
      sameReleasedState(version({ packages: { lodash: '^4' } }), version({ packages: { lodash: '^5' } }), [], new Map())
    ).to.be.false;
    expect(
      sameReleasedState(
        version({ deps: ['acme.cards/x@0.0.1'] }),
        version({ deps: ['acme.cards/x@0.0.2'] }),
        [],
        new Map()
      )
    ).to.be.false;
    expect(
      sameReleasedState(
        version({ config: [['teambit.envs/envs', { env: 'node' }]] }),
        version({ config: [['teambit.envs/envs', { env: 'react' }]] }),
        [],
        new Map()
      )
    ).to.be.false;
  });

  it('is false when only the overrides or package.json changes differ', () => {
    const base = version({});
    expect(sameReleasedState(base, { ...base, overrides: { dependencies: { x: '1' } } }, [], new Map())).to.be.false;
    expect(sameReleasedState(base, { ...base, packageJsonChangedProps: { sideEffects: false } }, [], new Map())).to.be
      .false;
  });

  it('keeps package-named extensions apart by their full name', () => {
    const a = version({ config: [['@scope/a', { x: 1 }]] });
    const b = version({ config: [['@scope/b', { x: 1 }]] });
    expect(sameReleasedState(a, b, [], new Map())).to.be.false;
    expect(sameReleasedState(a, version({ config: [['@scope/a', { x: 1 }]] }), [], new Map())).to.be.true;
  });

  it('is insensitive to key order in package dependencies and nested extension config', () => {
    const a = version({
      packages: { lodash: '^4', react: '^18' },
      config: [['teambit.envs/envs', { env: 'node', opts: { a: 1, b: 2 } }]],
    });
    const b = version({
      packages: { react: '^18', lodash: '^4' },
      config: [['teambit.envs/envs', { opts: { b: 2, a: 1 }, env: 'node' }]],
    });
    expect(sameReleasedState(a, b, [], new Map())).to.be.true;
  });

  it('accepts an on-lane extension only at its released head; an off-lane extension must match exactly', () => {
    const lane = version({ config: [['teambit.react/react@0.0.0-abc123', { compiler: 'swc' }]] });
    const released = version({ config: [['teambit.react/react@1.2.3', { compiler: 'swc' }]] });
    const onLane = ['teambit.react/react'];
    expect(sameReleasedState(lane, released, onLane, new Map([['teambit.react/react', '1.2.3']]))).to.be.true;
    expect(sameReleasedState(lane, released, onLane, new Map([['teambit.react/react', '1.2.4']]))).to.be.false;
    expect(sameReleasedState(lane, released, [], new Map())).to.be.false; // a lane-only env upgrade
    expect(
      sameReleasedState(
        lane,
        version({ config: [['teambit.react/react@1.2.3', { compiler: 'tsc' }]] }),
        onLane,
        new Map([['teambit.react/react', '1.2.3']])
      )
    ).to.be.false;
  });

  it('accepts an on-lane dependency only at its released head, and ignores extension data', () => {
    const lane = version({
      deps: ['acme.cards/x@abc123'],
      config: [['teambit.deps/resolver', { policy: {} }]],
      data: [['teambit.deps/resolver', { versions: 'lane' }]],
    });
    const released = version({
      deps: ['acme.cards/x@0.0.9'],
      config: [['teambit.deps/resolver', { policy: {} }]],
      data: [['teambit.deps/resolver', { versions: 'main' }]],
    });
    const headIs = (v: string) => new Map([['acme.cards/x', v]]);
    expect(sameReleasedState(lane, released, ['acme.cards/x'], headIs('0.0.9'))).to.be.true;
    // main still references an older tag of x: a stale main, not the release of this lane head
    expect(sameReleasedState(lane, released, ['acme.cards/x'], headIs('0.0.10'))).to.be.false;
    expect(sameReleasedState(lane, released, [], new Map())).to.be.false;
  });
});
