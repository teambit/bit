import path from 'path';
import { ComponentID } from '@teambit/component';
import { DependenciesGraph } from '@teambit/objects';
import {
  convertLockfileToGraph,
  convertGraphToLockfile,
  markOptionalOnlyEntries,
  init as initLockfileDepsGraphConverter,
} from './lockfile-deps-graph-converter';
import { type BitLockfileFile } from './lynx';
import { expect } from 'chai';

before(async () => {
  await initLockfileDepsGraphConverter();
});

describe('workspace components in a restored lockfile', () => {
  const comp1Dir = 'comps/comp1';
  const comp2Dir = 'comps/comp2';
  const comp2 = '@my-org/my-scope.comp2';
  const comp2FilePkgId = `${comp2}@file:${comp2Dir}`;
  const comp2FileDepPath = `${comp2FilePkgId}(react@18.3.1)`;

  /** A workspace lockfile where comp1 depends on the injected comp2, which has a peer. */
  function workspaceLockfile(): BitLockfileFile {
    return {
      lockfileVersion: '9.0',
      importers: {
        [comp1Dir]: {
          dependencies: {
            [comp2]: { version: `file:${comp2Dir}(react@18.3.1)`, specifier: '2.0.0' },
            react: { version: '18.3.1', specifier: '18.3.1' },
          },
        },
      },
      packages: {
        [comp2FilePkgId]: {
          resolution: { directory: comp2Dir, type: 'directory' },
          peerDependencies: { react: '*' },
        },
        'foo@1.0.0': { resolution: { integrity: 'sha512-foo' } },
        'react@18.3.1': { resolution: { integrity: 'sha512-react' } },
      },
      snapshots: {
        [comp2FileDepPath]: { dependencies: { foo: '1.0.0', react: '18.3.1' } },
        'foo@1.0.0': {},
        'react@18.3.1': {},
      },
      bit: { depsRequiringBuild: [comp2FilePkgId] },
    } as BitLockfileFile;
  }

  function toGraph(lockfile: BitLockfileFile) {
    return convertLockfileToGraph(lockfile, {
      componentRelativeDir: comp1Dir,
      componentIdByPkgName: new Map([[comp2, ComponentID.fromString('my-org.my-scope/comp2@2.0.0')]]),
    });
  }

  function toLockfile(graph: DependenciesGraph, comp2Version: string, resolve = failingResolver) {
    return convertGraphToLockfile(DependenciesGraph.deserialize(graph.serialize())!, {
      manifests: {
        [path.resolve(comp1Dir)]: { dependencies: { [comp2]: '2.0.0', react: '18.3.1' } },
        [path.resolve(comp2Dir)]: { name: comp2, version: comp2Version },
      },
      rootDir: process.cwd(),
      resolve,
    });
  }

  function failingResolver(): never {
    throw new Error('a workspace component must not be resolved from the registry');
  }

  it('should restore the file: package and snapshot of a workspace component, peer suffix included', async () => {
    const graph = toGraph(workspaceLockfile());
    expect(graph.packages.has(`${comp2}@2.0.0`)).to.equal(true);

    const lockfile = await toLockfile(graph, '2.0.0');

    expect(lockfile.importers![comp1Dir].dependencies![comp2]).to.eql({
      version: `file:${comp2Dir}(react@18.3.1)`,
      specifier: '2.0.0',
    });
    expect(lockfile.packages![comp2FilePkgId]).to.eql({
      resolution: { directory: comp2Dir, type: 'directory' },
      peerDependencies: { react: '*' },
    });
    expect(lockfile.packages).not.to.have.property(`${comp2}@2.0.0`);
    expect(lockfile.snapshots![comp2FileDepPath]).to.eql({ dependencies: { foo: '1.0.0', react: '18.3.1' } });
    expect(lockfile.snapshots).not.to.have.property(`${comp2}@2.0.0(react@18.3.1)`);
    expect(lockfile.packages!['foo@1.0.0']).to.eql({ resolution: { integrity: 'sha512-foo' } });
    expect(lockfile.bit?.depsRequiringBuild).to.eql([comp2FilePkgId]);
  });

  it('should keep a dependency on another version of a workspace component as a registry package', async () => {
    const graph = toGraph(workspaceLockfile());
    const resolved: string[] = [];

    const lockfile = await toLockfile(graph, '3.0.0', (async ({ alias, bareSpecifier }) => {
      resolved.push(`${alias}@${bareSpecifier}`);
      return { resolution: { integrity: 'sha512-comp2' } };
    }) as any);

    expect(resolved).to.eql([`${comp2}@2.0.0`]);
    expect(lockfile.importers![comp1Dir].dependencies![comp2]).to.eql({
      version: '2.0.0(react@18.3.1)',
      specifier: '2.0.0',
    });
    expect(lockfile.packages![`${comp2}@2.0.0`]).to.eql({
      resolution: { integrity: 'sha512-comp2' },
      peerDependencies: { react: '*' },
    });
    expect(lockfile.packages).not.to.have.property(comp2FilePkgId);
  });
});

describe('importer entries of a restored lockfile', () => {
  const comp1Dir = 'comps/comp1';
  const apolloVariant = '@apollo/client@3.3.21(graphql@15.8.0)';
  const graph = new DependenciesGraph({
    packages: new Map([
      ['@babel/runtime@7.20.0', { resolution: { integrity: 'sha512-runtime' } }],
      ['@teambit/ui.app@0.0.110', { resolution: { integrity: 'sha512-app' } }],
      ['@apollo/client@3.3.21', { resolution: { integrity: 'sha512-apollo' }, peerDependencies: { graphql: '*' } }],
      ['graphql@15.8.0', { resolution: { integrity: 'sha512-graphql' } }],
      ['graphql@16.0.0', { resolution: { integrity: 'sha512-graphql16' } }],
      ['lonely@1.0.0', { resolution: { integrity: 'sha512-lonely' } }],
    ] as any),
    edges: [
      {
        id: DependenciesGraph.ROOT_EDGE_ID,
        neighbours: [
          { id: '@babel/runtime@7.20.0', name: '@babel/runtime', specifier: '*', lifecycle: 'runtime' },
          {
            id: `@teambit/ui.app@0.0.110(${apolloVariant})`,
            name: '@teambit/ui.app',
            specifier: '0.0.110',
            lifecycle: 'runtime',
          },
        ],
      },
      {
        id: `@teambit/ui.app@0.0.110(${apolloVariant})`,
        attr: { pkgId: '@teambit/ui.app@0.0.110' },
        neighbours: [{ id: apolloVariant }],
      },
      { id: apolloVariant, attr: { pkgId: '@apollo/client@3.3.21' }, neighbours: [{ id: 'graphql@15.8.0' }] },
      {
        id: '@apollo/client@3.3.21(graphql@16.0.0)',
        attr: { pkgId: '@apollo/client@3.3.21' },
        neighbours: [{ id: 'graphql@16.0.0' }],
      },
    ],
  });

  function restore(dependencies: Record<string, string>) {
    return convertGraphToLockfile(DependenciesGraph.deserialize(graph.serialize())!, {
      manifests: { [path.resolve(comp1Dir)]: { dependencies } },
      rootDir: process.cwd(),
      resolve: () => {
        throw new Error('nothing here needs the registry');
      },
    });
  }

  it('matches a range specifier against the version the graph resolved', async () => {
    const lockfile = await restore({ '@babel/runtime': '^7.8.4' });
    expect(lockfile.importers![comp1Dir].dependencies!['@babel/runtime']).to.eql({
      version: '7.20.0',
      specifier: '^7.8.4',
    });
  });

  it('leaves a range specifier the resolved version does not satisfy without an entry', async () => {
    const lockfile = await restore({ '@babel/runtime': '^8.0.0' });
    expect(lockfile.importers![comp1Dir].dependencies).not.to.have.property('@babel/runtime');
  });

  it('points a version the graph holds only deeper in the tree at the variant the direct dependencies use', async () => {
    const lockfile = await restore({ '@apollo/client': '3.3.21', '@teambit/ui.app': '0.0.110' });
    expect(lockfile.importers![comp1Dir].dependencies!['@apollo/client']).to.eql({
      version: '3.3.21(graphql@15.8.0)',
      specifier: '3.3.21',
    });
    expect(lockfile.snapshots![apolloVariant]).to.eql({ dependencies: { graphql: '15.8.0' } });
  });

  it('points a version the graph holds only as a package at that package', async () => {
    const lockfile = await restore({ lonely: '1.0.0' });
    expect(lockfile.importers![comp1Dir].dependencies!.lonely).to.eql({ version: '1.0.0', specifier: '1.0.0' });
    expect(lockfile.snapshots!['lonely@1.0.0']).to.eql({});
  });

  it('leaves a version the graph does not hold without an entry', async () => {
    const lockfile = await restore({ '@apollo/client': '3.3.7' });
    expect(lockfile.importers![comp1Dir].dependencies).not.to.have.property('@apollo/client');
  });
});

describe('resolving a workspace-component package from the registry on restore', () => {
  const comp1Dir = 'comps/comp1';
  const pkgId = '@my-org/my-scope.comp2@1.0.0';

  function restore(resolve: (...args: any[]) => any) {
    const graph = new DependenciesGraph({
      packages: new Map([[pkgId, { component: { scope: 'my-org.my-scope', name: 'comp2' } } as any]]),
      edges: [
        {
          id: DependenciesGraph.ROOT_EDGE_ID,
          neighbours: [{ id: pkgId, name: '@my-org/my-scope.comp2', specifier: '1.0.0', lifecycle: 'runtime' }],
        },
        { id: pkgId, neighbours: [] },
      ],
    });
    return convertGraphToLockfile(graph, {
      manifests: { [path.resolve(comp1Dir)]: { dependencies: { '@my-org/my-scope.comp2': '1.0.0' } } },
      rootDir: process.cwd(),
      resolve,
    });
  }

  // `@pnpm/napi`'s resolveDependency reports a registry package's integrity in
  // the manifest's `dist`, and no `resolution` at all.
  it("takes the integrity from the resolved manifest's dist when the resolver reports no resolution", async () => {
    const lockfile = await restore(() => ({ manifest: { dist: { integrity: 'sha512-fromdist' } } }));
    expect(lockfile.packages![pkgId]).to.eql({ resolution: { integrity: 'sha512-fromdist' } });
    expect(lockfile.importers![comp1Dir].dependencies!['@my-org/my-scope.comp2']).to.eql({
      version: '1.0.0',
      specifier: '1.0.0',
    });
  });

  it('prefers the integrity of a resolution the resolver reports', async () => {
    const lockfile = await restore(() => ({
      resolution: { integrity: 'sha512-fromresolution' },
      manifest: { dist: { integrity: 'sha512-fromdist' } },
    }));
    expect(lockfile.packages![pkgId]).to.eql({ resolution: { integrity: 'sha512-fromresolution' } });
  });
});

describe('optional flags of a restored lockfile', () => {
  const comp1Dir = 'comps/comp1';

  it('marks the entries only optional edges reach, and leaves one a required path reaches alone', async () => {
    const graph = new DependenciesGraph({
      packages: new Map(
        ['ssh2@1.0.0', 'cpu-features@0.0.10', 'nan@2.29.0', 'fsevents@2.3.3'].map((id) => [
          id,
          { resolution: { integrity: `sha512-${id}` } } as any,
        ])
      ),
      edges: [
        {
          id: DependenciesGraph.ROOT_EDGE_ID,
          neighbours: [
            { id: 'ssh2@1.0.0', name: 'ssh2', specifier: '1.0.0', lifecycle: 'runtime' },
            { id: 'nan@2.29.0', name: 'nan', specifier: '2.29.0', lifecycle: 'runtime' },
            { id: 'fsevents@2.3.3', name: 'fsevents', specifier: '2.3.3', lifecycle: 'runtime', optional: true },
          ],
        },
        { id: 'ssh2@1.0.0', neighbours: [{ id: 'cpu-features@0.0.10', optional: true }] },
        { id: 'cpu-features@0.0.10', neighbours: [{ id: 'nan@2.29.0' }] },
      ],
    });
    const lockfile = await convertGraphToLockfile(graph, {
      manifests: {
        [path.resolve(comp1Dir)]: {
          dependencies: { ssh2: '1.0.0', nan: '2.29.0' },
          optionalDependencies: { fsevents: '2.3.3' },
        },
      },
      rootDir: process.cwd(),
      resolve: () => {
        throw new Error('nothing here needs the registry');
      },
    });
    expect(lockfile.snapshots!['cpu-features@0.0.10'].optional).to.equal(true);
    expect(lockfile.snapshots!['fsevents@2.3.3'].optional).to.equal(true);
    expect(lockfile.snapshots!['ssh2@1.0.0']).not.to.have.property('optional');
    // nan is reached optionally through cpu-features and directly as well.
    expect(lockfile.snapshots!['nan@2.29.0']).not.to.have.property('optional');
  });
});

describe('workspace: specifiers in a restored lockfile', () => {
  const comp1Dir = 'comps/comp1';
  const comp2Dir = 'comps/comp2';
  const comp2 = '@my-org/my-scope.comp2';
  // A merged graph can hold the sibling at two versions as direct dependencies.
  const graph = new DependenciesGraph({
    packages: new Map([
      [`${comp2}@1.0.0`, { resolution: { integrity: 'sha512-one' } }],
      [`${comp2}@2.0.0`, { resolution: { integrity: 'sha512-two' } }],
    ] as any),
    edges: [
      {
        id: DependenciesGraph.ROOT_EDGE_ID,
        neighbours: [
          { id: `${comp2}@1.0.0`, name: comp2, specifier: '1.0.0', lifecycle: 'runtime' },
          { id: `${comp2}@2.0.0`, name: comp2, specifier: '2.0.0', lifecycle: 'runtime' },
        ],
      },
    ],
  });

  function restore(specifier: string, comp2Version: string) {
    return convertGraphToLockfile(DependenciesGraph.deserialize(graph.serialize())!, {
      manifests: {
        [path.resolve(comp1Dir)]: { dependencies: { [comp2]: specifier } },
        [path.resolve(comp2Dir)]: { name: comp2, version: comp2Version },
      },
      rootDir: process.cwd(),
      resolve: () => ({ resolution: { integrity: 'sha512-other' } }) as any,
    });
  }

  it('points at the version the workspace holds, not the first same-name neighbour', async () => {
    const lockfile = await restore('workspace:^2', '2.0.0');
    expect(lockfile.importers![comp1Dir].dependencies![comp2]).to.eql({
      version: `file:${comp2Dir}`,
      specifier: 'workspace:^2',
    });
  });

  it('leaves the entry out when the range rejects the version the workspace holds', async () => {
    const lockfile = await restore('workspace:^3', '2.0.0');
    expect(lockfile.importers![comp1Dir].dependencies).not.to.have.property(comp2);
  });

  it('leaves the entry out when the graph lacks the version the workspace holds', async () => {
    const lockfile = await restore('workspace:*', '3.0.0');
    expect(lockfile.importers![comp1Dir].dependencies).not.to.have.property(comp2);
  });
});

describe('several direct dependencies of the same name in a restored lockfile', () => {
  const comp1Dir = 'comps/comp1';
  // A merged graph keeps one root neighbour per distinct specifier of foo.
  const graph = new DependenciesGraph({
    packages: new Map([
      ['foo@1.5.0', { resolution: { integrity: 'sha512-five' } }],
      ['foo@1.2.0', { resolution: { integrity: 'sha512-two' } }],
      ['foo@1.9.0', { resolution: { integrity: 'sha512-nine' } }],
    ] as any),
    edges: [
      {
        id: DependenciesGraph.ROOT_EDGE_ID,
        neighbours: [
          { id: 'foo@1.5.0', name: 'foo', specifier: '^1.5.0', lifecycle: 'runtime' },
          { id: 'foo@1.2.0', name: 'foo', specifier: '^1.0.0', lifecycle: 'runtime' },
          { id: 'foo@1.9.0', name: 'foo', specifier: '*', lifecycle: 'runtime' },
        ],
      },
    ],
  });

  function restore(specifier: string) {
    return convertGraphToLockfile(DependenciesGraph.deserialize(graph.serialize())!, {
      manifests: { [path.resolve(comp1Dir)]: { dependencies: { foo: specifier } } },
      rootDir: process.cwd(),
      resolve: () => {
        throw new Error('nothing here needs the registry');
      },
    });
  }

  it('takes the dependency recorded for the very specifier over one that merely satisfies it', async () => {
    const lockfile = await restore('^1.0.0');
    expect(lockfile.importers![comp1Dir].dependencies!.foo).to.eql({ version: '1.2.0', specifier: '^1.0.0' });
  });

  it('takes the dependency recorded at the very version', async () => {
    const lockfile = await restore('1.5.0');
    expect(lockfile.importers![comp1Dir].dependencies!.foo).to.eql({ version: '1.5.0', specifier: '1.5.0' });
  });

  it('takes the highest satisfying resolution when none was recorded for the specifier', async () => {
    const lockfile = await restore('^1.1.0');
    expect(lockfile.importers![comp1Dir].dependencies!.foo).to.eql({ version: '1.9.0', specifier: '^1.1.0' });
  });
});

describe('entries no importer reaches in a restored lockfile', () => {
  it('are dropped before anything is resolved from the registry', async () => {
    const graph = new DependenciesGraph({
      packages: new Map([
        ['foo@1.0.0', { resolution: { integrity: 'sha512-foo' } }],
        // An attached extension's dev dependency: no resolution, and nothing reaches it.
        ['@org/dev-only@1.0.0', { component: { scope: 'org', name: 'dev-only' } }],
      ] as any),
      edges: [
        {
          id: DependenciesGraph.ROOT_EDGE_ID,
          neighbours: [{ id: 'foo@1.0.0', name: 'foo', specifier: '1.0.0', lifecycle: 'runtime' }],
        },
      ],
    });
    const lockfile = await convertGraphToLockfile(graph, {
      manifests: { [path.resolve('comps/comp1')]: { dependencies: { foo: '1.0.0' } } },
      rootDir: process.cwd(),
      resolve: () => {
        throw new Error('an unreachable entry must not be resolved');
      },
    });
    expect(Object.keys(lockfile.packages!)).to.eql(['foo@1.0.0']);
  });
});

describe('optional flags under an aliased dependency', () => {
  it('walks into the package an alias names', () => {
    const lockfile = {
      importers: {
        'comps/comp1': {
          dependencies: { foo: { version: 'real-foo@1.0.0', specifier: 'npm:real-foo@1.0.0' } },
          optionalDependencies: { bar: { version: '1.0.0', specifier: '1.0.0' } },
        },
      },
      snapshots: {
        'real-foo@1.0.0': { optionalDependencies: { qar: '1.0.0' }, dependencies: { bar: '1.0.0' } },
        'bar@1.0.0': { optional: true },
        'qar@1.0.0': {},
      },
    };
    markOptionalOnlyEntries(lockfile as any);
    expect(lockfile.snapshots['real-foo@1.0.0']).not.to.have.property('optional');
    // Reached optionally from the importer, but required through the alias.
    expect(lockfile.snapshots['bar@1.0.0']).not.to.have.property('optional');
    expect(lockfile.snapshots['qar@1.0.0']).to.have.property('optional', true);
  });
});
