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
    expect(decision.summary).to.include('All 2 component(s) from other scope(s) (acme.docs, acme.payments)');
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
      getLanes: async () => [],
      importMainObjects: noop,
      getModelComponent: async () => undefined,
      importObjectsByHashes: noop,
      isReleasedByThisRun: () => false,
      objects: {} as any,
      warn: () => {},
      ...overrides,
    } as Parameters<typeof laneArchiveDecision>[2]);
  const foreignEntry = {
    id: { scope: 'acme.payments', changeVersion: () => ({}), toStringWithoutVersion: () => 'acme.payments/ui/table' },
    head: 'abc',
  };

  it('archives, silently, a lane the remote no longer has', async () => {
    const decision = await laneArchiveDecision(
      laneId,
      'acme.cards',
      deps({ getLanes: async () => Promise.reject(new Error('lane acme.cards/feature was not found')) })
    );
    expect(decision).to.deep.equal({ archive: true, summary: '' });
  });

  it('keeps the lane open when the remote cannot be read for another reason', async () => {
    const decision = await laneArchiveDecision(
      laneId,
      'acme.cards',
      deps({ getLanes: async () => Promise.reject(new Error('ECONNRESET')) })
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
        getLanes: async () => [{ components: [foreignEntry] } as any],
        importMainObjects: async () => Promise.reject(new Error('no route to acme.payments')),
        warn: (m) => warnings.push(m),
      })
    );
    expect(decision.archive).to.be.false;
    expect(decision.summary).to.include('could not be read: acme.payments/ui/table.');
    expect(warnings.join('\n')).to.include('no route to acme.payments');
  });

  it('counts a foreign component this run tagged and exported as released, and archives', async () => {
    // the one-repository, many-scopes shape: the repo holds components of several scopes and this
    // very run tagged and exported all of them — nothing else to wait for.
    const decision = await laneArchiveDecision(
      laneId,
      'acme.cards',
      deps({ getLanes: async () => [{ components: [foreignEntry] } as any], isReleasedByThisRun: () => true })
    );
    expect(decision.archive).to.be.true;
    expect(decision.summary).to.include('All 1 component(s) from other scope(s) (acme.payments)');
  });

  it('counts a foreign component hidden in updateDependents as lane work too', async () => {
    const decision = await laneArchiveDecision(
      laneId,
      'acme.cards',
      deps({ getLanes: async () => [{ components: [], updateDependents: [foreignEntry] } as any] })
    );
    expect(decision.archive).to.be.false;
    expect(decision.summary).to.include('not on their main yet: acme.payments/ui/table.');
  });

  it('treats a foreign component with no main yet as not released', async () => {
    const decision = await laneArchiveDecision(
      laneId,
      'acme.cards',
      deps({ getLanes: async () => [{ components: [foreignEntry] } as any] })
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
    const extensions = config.map(([stringId, cfg], i) => ({ stringId, config: cfg, data: data[i]?.[1] ?? {} }));
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
    expect(sameReleasedState(a, b, [])).to.be.true;
  });

  it('is false when a file differs, is missing, or is extra', () => {
    expect(sameReleasedState(version({ files: [['a.ts', '1']] }), version({ files: [['a.ts', '9']] }), [])).to.be.false;
    expect(
      sameReleasedState(
        version({
          files: [
            ['a.ts', '1'],
            ['b.ts', '2'],
          ],
        }),
        version({ files: [['a.ts', '1']] }),
        []
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
        []
      )
    ).to.be.false;
  });

  it('is false when only a package dependency, a component dependency version, or a config differs', () => {
    expect(sameReleasedState(version({ packages: { lodash: '^4' } }), version({ packages: { lodash: '^5' } }), [])).to
      .be.false;
    expect(sameReleasedState(version({ deps: ['acme.cards/x@0.0.1'] }), version({ deps: ['acme.cards/x@0.0.2'] }), []))
      .to.be.false;
    expect(
      sameReleasedState(
        version({ config: [['teambit.envs/envs', { env: 'node' }]] }),
        version({ config: [['teambit.envs/envs', { env: 'react' }]] }),
        []
      )
    ).to.be.false;
  });

  it('tolerates the version drift of a dependency that is itself on the lane, and ignores extension data', () => {
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
    expect(sameReleasedState(lane, released, ['acme.cards/x'])).to.be.true;
    expect(sameReleasedState(lane, released, [])).to.be.false;
  });
});
