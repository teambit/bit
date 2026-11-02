import { expect } from 'chai';
import type { DependencyEdge, PackagesMap } from './dependencies-graph';
import { DependenciesGraph } from './dependencies-graph';

describe('DependenciesGraph.merge', () => {
  it('adopts the more specific specifier when a wildcard direct dep merges with a manifest spec', () => {
    const base = createGraph(
      [rootEdge([{ id: 'foo@1.0.0', name: 'foo', specifier: '*' }]), edge('foo@1.0.0')],
      ['foo@1.0.0']
    );
    const incoming = createGraph(
      [rootEdge([{ id: 'foo@1.0.0', name: 'foo', specifier: '^1.0.0' }]), edge('foo@1.0.0')],
      ['foo@1.0.0']
    );

    base.merge(incoming);

    const foo = base.findRootEdge()?.neighbours.find((neighbour) => neighbour.name === 'foo');
    expect(foo?.specifier).to.equal('^1.0.0');
  });

  it('rewrites nested peer providers within their parent provider peer ranges', () => {
    const base = createGraph(
      [
        rootEdge([{ id: 'plugin@1.0.0(parser@1.0.0(typescript@5.0.0))', name: 'plugin', specifier: '1.0.0' }]),
        edge('plugin@1.0.0(parser@1.0.0(typescript@5.0.0))'),
        edge('parser@1.0.0(typescript@5.0.0)'),
        edge('typescript@5.0.0'),
      ],
      ['plugin@1.0.0', 'typescript@5.0.0']
    );
    base.packages.set('parser@1.0.0', { peerDependencies: { typescript: '^5.0.0' } } as any);
    const incoming = createGraph(
      [rootEdge([{ id: 'typescript@6.0.0', name: 'typescript', specifier: '6.0.0' }]), edge('typescript@6.0.0')],
      ['typescript@6.0.0']
    );

    base.merge(incoming);

    const plugin = base.findRootEdge()?.neighbours.find((neighbour) => neighbour.name === 'plugin');
    expect(plugin?.id).to.equal(
      'plugin@1.0.0(parser@1.0.0(typescript@5.0.0))',
      'typescript@6.0.0 does not satisfy parser@1.0.0 peer range ^5.0.0'
    );
  });

  it('keeps a peer provider that is referenced only inside a depPath suffix', () => {
    const base = createGraph(
      [
        rootEdge([{ id: 'consumer@1.0.0(peer@2.0.0)', name: 'consumer', specifier: '1.0.0' }]),
        edge('consumer@1.0.0(peer@2.0.0)'),
      ],
      ['consumer@1.0.0', 'peer@2.0.0']
    );

    base.merge(createGraph([], []));

    expect(base.packages.has('peer@2.0.0')).to.equal(true);
  });

  it('keeps the patch_hash segment in front of sorted peer segments', () => {
    const base = createGraph(
      [
        rootEdge([{ id: 'foo@1.0.0(patch_hash=abc)(bar@1.0.0)', name: 'foo', specifier: '1.0.0' }]),
        edge('foo@1.0.0(patch_hash=abc)(bar@1.0.0)'),
        edge('bar@1.0.0'),
      ],
      ['foo@1.0.0', 'bar@1.0.0']
    );
    base.packages.set('foo@1.0.0', { peerDependencies: { bar: '^1.0.0' } } as any);
    const incoming = createGraph(
      [rootEdge([{ id: 'bar@1.0.0', name: 'bar', specifier: '1.0.0' }]), edge('bar@1.0.0')],
      ['bar@1.0.0']
    );

    base.merge(incoming);

    const foo = base.findRootEdge()?.neighbours.find((neighbour) => neighbour.name === 'foo');
    expect(foo?.id).to.equal('foo@1.0.0(patch_hash=abc)(bar@1.0.0)');
  });

  it('does not overflow the stack on a deep dependency chain', () => {
    const depth = 50000;
    const edges: DependencyEdge[] = [rootEdge([{ id: 'pkg0@1.0.0', name: 'pkg0', specifier: '1.0.0' }])];
    const packageIds: string[] = [];
    for (let i = 0; i < depth; i += 1) {
      const id = `pkg${i}@1.0.0`;
      packageIds.push(id);
      edges.push(edge(id, i + 1 < depth ? [{ id: `pkg${i + 1}@1.0.0` }] : []));
    }
    const graph = createGraph(edges, packageIds);

    graph.merge(createGraph([], []));

    expect(graph.packages.size).to.equal(depth);
  });
});

describe('DependenciesGraph pnpmfileChecksum', () => {
  it('survives serialize and deserialize', () => {
    const graph = createGraph([rootEdge([])], []);
    graph.pnpmfileChecksum = 'hooks-1';

    const restored = DependenciesGraph.deserialize(graph.serialize());

    expect(restored?.pnpmfileChecksum).to.equal('hooks-1');
  });

  it('is omitted from the serialized graph when unset', () => {
    const graph = createGraph([rootEdge([])], []);

    expect(JSON.parse(graph.serialize())).not.to.have.property('pnpmfileChecksum');
  });

  it('deserializes a graph serialized before the field existed', () => {
    const restored = DependenciesGraph.deserialize(
      JSON.stringify({ schemaVersion: '2.0', packages: { 'foo@1.0.0': {} }, edges: [rootEdge([])] })
    );

    expect(restored).not.to.equal(undefined);
    expect(restored?.packages.has('foo@1.0.0')).to.equal(true);
    expect(restored?.pnpmfileChecksum).to.equal(undefined);
  });

  it('is kept by merge when both graphs have the same value', () => {
    const base = createGraph([rootEdge([])], []);
    base.pnpmfileChecksum = 'hooks-1';
    const incoming = createGraph([rootEdge([])], []);
    incoming.pnpmfileChecksum = 'hooks-1';

    base.merge(incoming);

    expect(base.pnpmfileChecksum).to.equal('hooks-1');
  });

  it('is dropped by merge when the graphs have different values', () => {
    const base = createGraph([rootEdge([{ id: 'foo@1.0.0', name: 'foo', specifier: '1.0.0' }])], ['foo@1.0.0']);
    base.pnpmfileChecksum = 'hooks-1';
    const incoming = createGraph([rootEdge([{ id: 'bar@1.0.0', name: 'bar', specifier: '1.0.0' }])], ['bar@1.0.0']);
    incoming.pnpmfileChecksum = 'hooks-2';

    base.merge(incoming);

    expect(base.pnpmfileChecksum).to.equal(undefined);
  });

  it('is dropped by merge when only one graph has it', () => {
    const base = createGraph([rootEdge([{ id: 'foo@1.0.0', name: 'foo', specifier: '1.0.0' }])], ['foo@1.0.0']);
    base.pnpmfileChecksum = 'hooks-1';

    base.merge(createGraph([rootEdge([{ id: 'bar@1.0.0', name: 'bar', specifier: '1.0.0' }])], ['bar@1.0.0']));

    expect(base.pnpmfileChecksum).to.equal(undefined);
  });

  it('is not affected by merging a graph without dependencies', () => {
    const base = createGraph([rootEdge([{ id: 'foo@1.0.0', name: 'foo', specifier: '1.0.0' }])], ['foo@1.0.0']);
    base.pnpmfileChecksum = 'hooks-1';

    base.merge(createGraph([rootEdge([])], []));

    expect(base.pnpmfileChecksum).to.equal('hooks-1');
  });

  it('is taken from the incoming graph when the base has no dependencies', () => {
    const base = createGraph([rootEdge([])], []);
    const incoming = createGraph([rootEdge([{ id: 'foo@1.0.0', name: 'foo', specifier: '1.0.0' }])], ['foo@1.0.0']);
    incoming.pnpmfileChecksum = 'hooks-1';

    base.merge(incoming);

    expect(base.pnpmfileChecksum).to.equal('hooks-1');
  });
});

function createGraph(edges: DependencyEdge[], packageIds: string[]): DependenciesGraph {
  const packages: PackagesMap = new Map(packageIds.map((id) => [id, {} as any]));
  return new DependenciesGraph({ packages, edges });
}

function rootEdge(neighbours: DependencyEdge['neighbours']): DependencyEdge {
  return { id: DependenciesGraph.ROOT_EDGE_ID, neighbours };
}

function edge(id: string, neighbours: DependencyEdge['neighbours'] = []): DependencyEdge {
  return { id, neighbours };
}

describe('DependenciesGraph overrides', () => {
  const overrides = { '@teambit/legacy@*': '-', react: '19.1.0' };

  it('survives serialize and deserialize', () => {
    const graph = createGraph([rootEdge([])], []);
    graph.overrides = overrides;

    expect(DependenciesGraph.deserialize(graph.serialize())?.overrides).to.eql(overrides);
  });

  it("stand in for the checksum of Bit's readPackage hooks, which the overrides replaced", () => {
    const restored = DependenciesGraph.deserialize(
      JSON.stringify({ schemaVersion: '2.0', packages: {}, edges: [rootEdge([])], pnpmfileChecksum: 'bit-1' })
    );

    expect(restored?.pnpmfileChecksum).to.equal(undefined);
    expect(restored?.overrides).to.eql({ '@teambit/legacy@*': '-', '@teambit/harmony@*': '-' });
  });

  it('are kept by merge when both graphs have the same ones', () => {
    const base = createGraph([rootEdge([{ id: 'foo@1.0.0', name: 'foo', specifier: '1.0.0' }])], ['foo@1.0.0']);
    base.overrides = overrides;
    const incoming = createGraph([rootEdge([{ id: 'bar@1.0.0', name: 'bar', specifier: '1.0.0' }])], ['bar@1.0.0']);
    incoming.overrides = { ...overrides };

    base.merge(incoming);

    expect(base.overrides).to.eql(overrides);
  });

  it('are dropped by merge when the graphs have different ones', () => {
    const base = createGraph([rootEdge([{ id: 'foo@1.0.0', name: 'foo', specifier: '1.0.0' }])], ['foo@1.0.0']);
    base.overrides = overrides;
    const incoming = createGraph([rootEdge([{ id: 'bar@1.0.0', name: 'bar', specifier: '1.0.0' }])], ['bar@1.0.0']);
    incoming.overrides = { ...overrides, react: '18.3.1' };

    base.merge(incoming);

    expect(base.overrides).to.equal(undefined);
  });
});

describe('DependenciesGraph lockfileSettings', () => {
  const settings = { autoInstallPeers: true, dedupePeers: true, injectWorkspacePackages: true };

  it('survives serialize and deserialize', () => {
    const graph = createGraph([rootEdge([])], []);
    graph.lockfileSettings = settings;

    expect(DependenciesGraph.deserialize(graph.serialize())?.lockfileSettings).to.eql(settings);
  });

  it('is unset on a graph serialized before the field existed', () => {
    const restored = DependenciesGraph.deserialize(
      JSON.stringify({ schemaVersion: '2.0', packages: {}, edges: [rootEdge([])] })
    );

    expect(restored?.lockfileSettings).to.equal(undefined);
  });

  it('is kept by merge when both graphs were resolved under the same settings', () => {
    const base = createGraph([rootEdge([{ id: 'foo@1.0.0', name: 'foo', specifier: '1.0.0' }])], ['foo@1.0.0']);
    base.lockfileSettings = settings;
    const incoming = createGraph([rootEdge([{ id: 'bar@1.0.0', name: 'bar', specifier: '1.0.0' }])], ['bar@1.0.0']);
    incoming.lockfileSettings = { ...settings };

    base.merge(incoming);

    expect(base.lockfileSettings).to.eql(settings);
  });

  it('is dropped by merge when the graphs were resolved under different settings', () => {
    const base = createGraph([rootEdge([{ id: 'foo@1.0.0', name: 'foo', specifier: '1.0.0' }])], ['foo@1.0.0']);
    base.lockfileSettings = settings;
    const incoming = createGraph([rootEdge([{ id: 'bar@1.0.0', name: 'bar', specifier: '1.0.0' }])], ['bar@1.0.0']);
    incoming.lockfileSettings = { ...settings, dedupePeers: false };

    base.merge(incoming);

    expect(base.lockfileSettings).to.equal(undefined);
  });

  it('is dropped by merge when only one graph has them', () => {
    const base = createGraph([rootEdge([{ id: 'foo@1.0.0', name: 'foo', specifier: '1.0.0' }])], ['foo@1.0.0']);
    base.lockfileSettings = settings;

    base.merge(createGraph([rootEdge([{ id: 'bar@1.0.0', name: 'bar', specifier: '1.0.0' }])], ['bar@1.0.0']));

    expect(base.lockfileSettings).to.equal(undefined);
  });
});

describe('DependenciesGraph.attachDependencyGraph', () => {
  const envPkgId = '@org/my-env@0.0.0-9b688a446040db8b4c50fec72ea3134c1e2c9d0e';

  function envGraph(): DependenciesGraph {
    return createGraph(
      [
        rootEdge([
          { id: 'webpack@5.0.0(esbuild@0.20.0)', name: 'webpack', specifier: '5.0.0', lifecycle: 'runtime' },
          { id: 'mocha@10.0.0', name: 'mocha', specifier: '10.0.0', lifecycle: 'dev' },
          { id: 'fsevents@2.3.3', name: 'fsevents', specifier: '*', lifecycle: 'runtime', optional: true },
        ]),
        {
          id: 'webpack@5.0.0(esbuild@0.20.0)',
          attr: { pkgId: 'webpack@5.0.0' },
          neighbours: [{ id: 'esbuild@0.20.0' }],
        },
      ],
      ['webpack@5.0.0', 'esbuild@0.20.0', 'mocha@10.0.0', 'fsevents@2.3.3', 'foo@1.0.0']
    );
  }

  it('adds the dependency as a node with its runtime dependencies, and as a direct dependency of the root', () => {
    const graph = createGraph([rootEdge([{ id: 'foo@1.0.0', name: 'foo', specifier: '1.0.0' }])], ['foo@1.0.0']);

    graph.attachDependencyGraph(envPkgId, envGraph(), { component: { scope: 'org', name: 'my-env' } });

    const envEdge = graph.edges.find(({ id }) => id === envPkgId);
    expect(envEdge?.neighbours).to.eql([
      { id: 'webpack@5.0.0(esbuild@0.20.0)' },
      { id: 'fsevents@2.3.3', optional: true },
    ]);
    expect(graph.packages.get(envPkgId)).to.eql({ component: { scope: 'org', name: 'my-env' } });
    expect(graph.packages.has('esbuild@0.20.0')).to.equal(true);
    expect(graph.edges.some(({ id }) => id === 'webpack@5.0.0(esbuild@0.20.0)')).to.equal(true);
    expect(graph.findRootEdge()?.neighbours.map(({ id }) => id)).to.eql(['foo@1.0.0', envPkgId]);
    expect(graph.findRootEdge()?.neighbours[1]).to.include({ name: '@org/my-env', lifecycle: 'dev' });
  });

  it('claims the resolution inputs only when both graphs agree on them, like a merge', () => {
    const graph = createGraph([rootEdge([{ id: 'foo@1.0.0', name: 'foo', specifier: '1.0.0' }])], ['foo@1.0.0']);
    graph.overrides = { 'react@19': '19.2.7' };
    graph.lockfileSettings = { autoInstallPeers: true, dedupePeers: true } as any;
    const sameContext = envGraph();
    sameContext.overrides = { 'react@19': '19.2.7' };
    sameContext.lockfileSettings = { autoInstallPeers: true, dedupePeers: true } as any;

    graph.attachDependencyGraph(envPkgId, sameContext);
    expect(graph.overrides).to.eql({ 'react@19': '19.2.7' });
    expect(graph.lockfileSettings).to.eql({ autoInstallPeers: true, dedupePeers: true });

    const otherContext = envGraph();
    otherContext.overrides = { 'react@19': '19.2.8' };
    graph.attachDependencyGraph('@org/other-env@1.0.0', otherContext);
    expect(graph.overrides).to.equal(undefined);
    expect(graph.lockfileSettings).to.equal(undefined);
  });

  it('completes a node the graph knows only as a package record, keeping that record', () => {
    // The workspace links its env, so a component's graph records the env as a
    // package some dependency reached, with nothing of what the env depends on.
    const graph = createGraph([rootEdge([{ id: 'foo@1.0.0', name: 'foo', specifier: '1.0.0' }])], ['foo@1.0.0']);
    graph.packages.set(envPkgId, { component: { scope: 'org', name: 'my-env' }, requiresBuild: true } as any);
    expect(graph.hasDependencyNode(envPkgId)).to.equal(false);

    graph.attachDependencyGraph(envPkgId, envGraph(), { component: { scope: 'org', name: 'my-env' } });

    expect(graph.hasDependencyNode(envPkgId)).to.equal(true);
    expect(graph.edges.find(({ id }) => id === envPkgId)?.neighbours.map(({ id }) => id)).to.eql([
      'webpack@5.0.0(esbuild@0.20.0)',
      'fsevents@2.3.3',
    ]);
    expect(graph.packages.get(envPkgId)).to.eql({ component: { scope: 'org', name: 'my-env' }, requiresBuild: true });
    expect(graph.findRootEdge()?.neighbours.map(({ id }) => id)).to.eql(['foo@1.0.0', envPkgId]);
  });

  it('leaves a package the graph records as a resolved leaf alone', () => {
    // A component dependency without dependencies of its own has no edge, only
    // a record with a resolution; it is no extension.
    const graph = createGraph([rootEdge([{ id: envPkgId, name: '@org/my-env', specifier: '1.0.0' }])], []);
    graph.packages.set(envPkgId, { resolution: { integrity: 'sha512-leaf' } } as any);
    expect(graph.recordsResolvedPackage(envPkgId)).to.equal(true);

    graph.attachDependencyGraph(envPkgId, envGraph());

    expect(graph.hasDependencyNode(envPkgId)).to.equal(false);
    expect(graph.packages.has('webpack@5.0.0')).to.equal(false);
  });

  it('attaches a nested extension as a dependency of the extension that declares it', () => {
    const graph = createGraph([rootEdge([{ id: 'foo@1.0.0', name: 'foo', specifier: '1.0.0' }])], ['foo@1.0.0']);
    graph.attachDependencyGraph(envPkgId, envGraph(), { component: { scope: 'org', name: 'my-env' } });
    const nestedPkgId = '@org/my-aspect@1.0.0';
    const nestedGraph = createGraph(
      [rootEdge([{ id: 'lodash@4.17.21', name: 'lodash', specifier: '4.17.21', lifecycle: 'runtime' }])],
      ['lodash@4.17.21']
    );

    graph.attachDependencyGraph(
      nestedPkgId,
      nestedGraph,
      { component: { scope: 'org', name: 'my-aspect' } },
      { dependentPkgId: envPkgId }
    );

    expect(graph.edges.find(({ id }) => id === envPkgId)?.neighbours.map(({ id }) => id)).to.eql([
      'webpack@5.0.0(esbuild@0.20.0)',
      'fsevents@2.3.3',
      nestedPkgId,
    ]);
    expect(graph.edges.find(({ id }) => id === nestedPkgId)?.neighbours).to.eql([{ id: 'lodash@4.17.21' }]);
    expect(graph.packages.has('lodash@4.17.21')).to.equal(true);
    // Not a direct dependency of the root: no manifest of the capsule declares it.
    expect(graph.findRootEdge()?.neighbours.map(({ id }) => id)).to.eql(['foo@1.0.0', envPkgId]);
  });

  it('links a nested extension the graph already resolved to the extension that declares it', () => {
    const nestedPkgId = '@org/my-aspect@1.0.0';
    const graph = createGraph([rootEdge([]), edge(nestedPkgId, [{ id: 'foo@1.0.0' }])], ['foo@1.0.0', nestedPkgId]);
    graph.attachDependencyGraph(envPkgId, envGraph());

    graph.attachDependencyGraph(nestedPkgId, envGraph(), {}, { dependentPkgId: envPkgId });

    expect(graph.edges.find(({ id }) => id === envPkgId)?.neighbours.map(({ id }) => id)).to.include(nestedPkgId);
    expect(graph.edges.find(({ id }) => id === nestedPkgId)?.neighbours).to.eql([{ id: 'foo@1.0.0' }]);
  });

  it('links a nested extension the graph resolved only as a peer variant to the variant whose peers the dependent provides', () => {
    const nestedPkgId = '@org/my-aspect@1.0.0';
    const graph = createGraph(
      [
        rootEdge([]),
        { id: `${nestedPkgId}(react@17.0.2)`, attr: { pkgId: nestedPkgId }, neighbours: [{ id: 'react@17.0.2' }] },
        { id: `${nestedPkgId}(react@18.3.1)`, attr: { pkgId: nestedPkgId }, neighbours: [{ id: 'react@18.3.1' }] },
      ],
      [nestedPkgId, 'react@17.0.2', 'react@18.3.1']
    );
    const env = createGraph(
      [rootEdge([{ id: 'react@18.3.1', name: 'react', specifier: '18.3.1', lifecycle: 'runtime' }])],
      ['react@18.3.1']
    );
    graph.attachDependencyGraph(envPkgId, env);

    graph.attachDependencyGraph(nestedPkgId, envGraph(), {}, { dependentPkgId: envPkgId });

    expect(graph.edges.find(({ id }) => id === envPkgId)?.neighbours.map(({ id }) => id)).to.eql([
      'react@18.3.1',
      `${nestedPkgId}(react@18.3.1)`,
    ]);
  });

  it('leaves the edges of the graphs it took them from unchanged when linking a nested extension', () => {
    const graph = createGraph([rootEdge([])], []);
    const shared = envGraph();
    graph.attachDependencyGraph(envPkgId, shared);
    const sharedWebpackEdge = shared.edges.find(({ id }) => id === 'webpack@5.0.0(esbuild@0.20.0)')!;

    graph.addDependencyOf('webpack@5.0.0(esbuild@0.20.0)', '@org/my-aspect@1.0.0');

    expect(sharedWebpackEdge.neighbours).to.eql([{ id: 'esbuild@0.20.0' }]);
    expect(graph.edges.find(({ id }) => id === 'webpack@5.0.0(esbuild@0.20.0)')?.neighbours).to.eql([
      { id: 'esbuild@0.20.0' },
      { id: '@org/my-aspect@1.0.0' },
    ]);
  });

  it('leaves a graph that already holds the node alone', () => {
    const graph = createGraph([rootEdge([]), edge(envPkgId, [{ id: 'foo@1.0.0' }])], ['foo@1.0.0', envPkgId]);

    graph.attachDependencyGraph(envPkgId, envGraph());

    expect(graph.edges.find(({ id }) => id === envPkgId)?.neighbours).to.eql([{ id: 'foo@1.0.0' }]);
    expect(graph.packages.has('webpack@5.0.0')).to.equal(false);
  });
});
