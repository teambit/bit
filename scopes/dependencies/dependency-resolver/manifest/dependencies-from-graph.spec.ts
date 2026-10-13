import { expect } from 'chai';
import { DependenciesGraph, type DependencyNeighbour } from '@teambit/objects';
import { applyDependenciesGraph, resolvedVersionsInGraph } from './dependencies-from-graph';

function graphWithDirectDeps(neighbours: DependencyNeighbour[], packageIds: string[] = []): DependenciesGraph {
  return new DependenciesGraph({
    packages: new Map(packageIds.map((pkgId) => [pkgId, {} as any])),
    edges: [{ id: DependenciesGraph.ROOT_EDGE_ID, neighbours }],
  });
}

const apollo = '@apollo/client';
const graph = graphWithDirectDeps([
  { id: '@babel/runtime@7.20.0', name: '@babel/runtime', specifier: '*', lifecycle: 'runtime' },
  { id: 'core-js@3.50.0', name: 'core-js', specifier: '^3.6.5', lifecycle: 'runtime' },
  { id: '@types/jest@26.0.24', name: '@types/jest', specifier: '~26.0.9', lifecycle: 'dev' },
  { id: 'fsevents@2.3.3', name: 'fsevents', specifier: '*', lifecycle: 'runtime', optional: true },
  { id: 'react@18.3.1', name: 'react', specifier: '*', lifecycle: 'runtime' },
  {
    id: `@teambit/ui.app@0.0.110(${apollo}@3.3.21(graphql@15.8.0))(react@18.3.1)`,
    name: '@teambit/ui.app',
    specifier: '0.0.110',
    lifecycle: 'runtime',
  },
  { id: '@teambit/sibling@0.0.5', name: '@teambit/sibling', specifier: '0.0.5', lifecycle: 'runtime' },
]);

describe('resolvedVersionsInGraph', () => {
  it('maps the direct dependencies and their peers, nested suffixes included, to the resolved versions', () => {
    const versions = resolvedVersionsInGraph(graph);
    expect(versions.get('@babel/runtime')).to.equal('7.20.0');
    expect(versions.get('@teambit/ui.app')).to.equal('0.0.110');
    expect(versions.get(apollo)).to.equal('3.3.21');
    expect(versions.get('graphql')).to.equal('15.8.0');
    expect(versions.get('react')).to.equal('18.3.1');
  });
});

describe('applyDependenciesGraph', () => {
  const declared = {
    dependencies: {
      '@babel/runtime': '^7.8.4',
      'core-js': '^3.6.5',
      '@teambit/ui.app': '0.0.110',
      '@teambit/sibling': '0.0.5',
      '@teambit/my-env': '0.0.0-9b688a446040db8b4c50fec72ea3134c1e2c9d0e',
    },
    devDependencies: { '@types/jest': '~26.0.9' },
    optionalDependencies: {},
    peerDependencies: { react: '^18.0.0' },
  };
  const envPeers = { [apollo]: '3.3.7', '@types/node': '18.16.1', react: '18.2.0' };
  const exclude = new Set(['@teambit/sibling']);

  it('declares the direct dependencies at the versions the graph resolved, under their lifecycles', () => {
    const applied = applyDependenciesGraph({ graph, declared, envPeers, exclude });
    expect(applied.dependencies['@babel/runtime']).to.equal('7.20.0');
    expect(applied.dependencies['core-js']).to.equal('3.50.0');
    expect(applied.dependencies['@teambit/ui.app']).to.equal('0.0.110');
    expect(applied.devDependencies).to.eql({ '@types/jest': '26.0.24' });
    expect(applied.optionalDependencies).to.eql({ fsevents: '2.3.3' });
  });

  it('keeps a declared dependency the graph lacks, such as the env', () => {
    const applied = applyDependenciesGraph({ graph, declared, envPeers, exclude });
    expect(applied.dependencies['@teambit/my-env']).to.equal('0.0.0-9b688a446040db8b4c50fec72ea3134c1e2c9d0e');
  });

  it('lets a declaration the graph contradicts win', () => {
    const resnapped = { ...declared, dependencies: { ...declared.dependencies, '@teambit/ui.app': '0.0.111' } };
    const applied = applyDependenciesGraph({ graph, declared: resnapped, envPeers, exclude });
    expect(applied.dependencies['@teambit/ui.app']).to.equal('0.0.111');
  });

  it('never takes an excluded package from the graph', () => {
    const applied = applyDependenciesGraph({ graph, declared, envPeers, exclude });
    expect(applied.dependencies['@teambit/sibling']).to.equal('0.0.5');
  });

  it('turns a declared peer the graph resolved into a runtime dependency at that version', () => {
    const applied = applyDependenciesGraph({ graph, declared, envPeers, exclude });
    expect(applied.dependencies.react).to.equal('18.3.1');
    expect(applied.envPeers).not.to.have.property('react');
  });

  it("gives an env peer the graph's version, and the env's pin only where the graph never met it", () => {
    const applied = applyDependenciesGraph({ graph, declared, envPeers, exclude });
    expect(applied.envPeers[apollo]).to.equal('3.3.21');
    expect(applied.envPeers['@types/node']).to.equal('18.16.1');
  });

  it('takes a declared dependency the root edge lacks from the highest accepted version the graph holds', () => {
    const hoisted = graphWithDirectDeps([], ['core-js@2.6.12', 'core-js@3.8.3', 'core-js@3.50.0', 'core-js@4.0.0']);
    const applied = applyDependenciesGraph({
      graph: hoisted,
      declared: { dependencies: { 'core-js': '^3.6.5' }, peerDependencies: { react: '^18.0.0' } },
      envPeers: {},
      exclude: new Set(),
    });
    expect(applied.dependencies['core-js']).to.equal('3.50.0');
    expect(applied.dependencies).not.to.have.property('react');
  });

  it('declares nothing from an empty graph beyond the declarations', () => {
    const applied = applyDependenciesGraph({ graph: graphWithDirectDeps([]), declared, envPeers, exclude });
    expect(applied.dependencies).to.eql(declared.dependencies);
    expect(applied.devDependencies).to.eql(declared.devDependencies);
    expect(applied.envPeers).to.eql(envPeers);
  });
});
