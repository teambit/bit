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
