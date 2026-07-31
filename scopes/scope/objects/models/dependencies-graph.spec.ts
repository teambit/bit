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
