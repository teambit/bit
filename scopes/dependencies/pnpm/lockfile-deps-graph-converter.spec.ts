import path from 'path';
import { ComponentID } from '@teambit/component';
import { DependenciesGraph, type PackagesMap, type DependencyEdge } from '@teambit/objects';
import { convertLockfileToGraph, convertGraphToLockfile } from './lockfile-deps-graph-converter';
import { type BitLockfileFile } from './lynx';
import { expect } from 'chai';

describe('convertLockfileToGraph simple case', () => {
  const lockfile: BitLockfileFile = {
    bit: {
      depsRequiringBuild: ['bar@1.0.0'],
    },
    importers: {
      '.': {},
      'node_modules/.bit_roots/env': {
        dependencies: {
          comp1: {
            version: 'file:comps/comp1',
            specifier: '*',
          },
        },
      },
      'comps/comp1': {
        dependencies: {
          foo: {
            version: '1.0.0(patch_hash=0000)',
            specifier: '^1.0.0',
          },
          qar: {
            version: '1.1.0',
            specifier: '^1.0.0',
          },
          zoo: {
            version: '1.1.0(qar@1.1.0)',
            specifier: '^1.1.0',
          },
        },
      },
    },
    lockfileVersion: '9.0',
    snapshots: {
      'foo@1.0.0(patch_hash=0000)': {
        dependencies: {
          bar: '1.0.0',
        },
      },
      'bar@1.0.0': {},
      'qar@1.1.0': {},
      'zoo@1.1.0(qar@1.1.0)': {
        dependencies: {
          qar: '1.1.0',
        },
      },
      'comp1@file:comps/comp1': {
        dependencies: {
          foo: '1.0.0(patch_hash=0000)',
          qar: '1.1.0',
          zoo: '1.1.0(qar@1.1.0)',
          comp2: 'file:comps/comp2',
        },
      },
      'comp2@file:comps/comp2': {
        dependencies: {},
      },
    },
    packages: {
      'comp1@file:comps/comp1': {
        resolution: {
          directory: 'comps/comp1',
          type: 'directory',
        },
      },
      'comp2@file:comps/comp2': {
        resolution: {
          directory: 'comps/comp2',
          type: 'directory',
        },
      },
      'foo@1.0.0': {
        engines: {
          node: '>=8',
          npm: '>=6',
        },
        hasBin: true,
        os: ['darwin'],
        cpu: ['arm64'],
        resolution: {
          integrity: 'sha512-000',
        },
      },
      'bar@1.0.0': {
        resolution: {
          integrity: 'sha512-111',
        },
      },
      'qar@1.1.0': {
        resolution: {
          integrity: 'sha512-222',
        },
      },
      'zoo@1.1.0': {
        peerDependencies: {
          qar: '*',
        },
        resolution: {
          integrity: 'sha512-333',
        },
      },
    },
  };
  const graph = convertLockfileToGraph(lockfile, {
    pkgName: 'comp1',
    componentRelativeDir: 'comps/comp1',
    componentRootDir: 'node_modules/.bit_roots/env',
    componentIdByPkgName: new Map([
      ['comp1', ComponentID.fromString('my-scope/comp1@1.0.0')],
      ['comp2', ComponentID.fromString('my-scope/comp2@1.0.0')],
    ]),
  });
  const expected = {
    schemaVersion: '2.0',
    edges: [
      {
        id: 'foo@1.0.0(patch_hash=0000)',
        neighbours: [{ id: 'bar@1.0.0', optional: false }],
        attr: {
          pkgId: 'foo@1.0.0',
        },
      },
      {
        id: 'zoo@1.1.0(qar@1.1.0)',
        neighbours: [{ id: 'qar@1.1.0', optional: false }],
        attr: {
          pkgId: 'zoo@1.1.0',
        },
      },
      {
        id: '.',
        neighbours: [
          {
            id: 'foo@1.0.0(patch_hash=0000)',
            name: 'foo',
            specifier: '^1.0.0',
            lifecycle: 'runtime',
            optional: false,
          },
          {
            id: 'qar@1.1.0',
            name: 'qar',
            specifier: '^1.0.0',
            lifecycle: 'runtime',
            optional: false,
          },
          {
            id: 'zoo@1.1.0(qar@1.1.0)',
            name: 'zoo',
            specifier: '^1.1.0',
            lifecycle: 'runtime',
            optional: false,
          },
          {
            id: 'comp2@1.0.0',
            lifecycle: 'runtime',
            name: 'comp2',
            optional: false,
            specifier: '*',
          },
        ],
      },
    ],
    packages: {
      'foo@1.0.0': {
        engines: {
          node: '>=8',
          npm: '>=6',
        },
        hasBin: true,
        os: ['darwin'],
        cpu: ['arm64'],
        resolution: {
          integrity: 'sha512-000',
        },
      },
      'bar@1.0.0': {
        requiresBuild: true,
        resolution: {
          integrity: 'sha512-111',
        },
      },
      'qar@1.1.0': {
        resolution: {
          integrity: 'sha512-222',
        },
      },
      'zoo@1.1.0': {
        peerDependencies: {
          qar: '*',
        },
        resolution: {
          integrity: 'sha512-333',
        },
      },
      'comp2@1.0.0': {
        component: {
          name: 'comp2',
          scope: 'my-scope',
        },
      },
    },
  };
  it('should convert the lockfile object to the graph object', () => {
    expect({
      ...graph,
      packages: Object.fromEntries(graph.packages.entries()),
    }).to.eql(expected);
  });
  it('should convert the graph object to the lockfile object', async () => {
    expect(
      await convertGraphToLockfile(new DependenciesGraph(graph), {
        manifests: {
          [path.resolve('comps/comp1')]: {
            dependencies: {
              foo: '^1.0.0',
              bar: `link:${path.resolve('comps/bar')}`, // Links from the manifests are added to the lockfile
              qar: '1.1.0',
              zoo: '1.1.0',
              comp2: '1.0.0',
            },
          },
        },
        rootDir: process.cwd(),
        resolve: () => ({ resolution: { integrity: '0000' } }) as any,
      })
    ).to.eql({
      bit: {
        depsRequiringBuild: ['bar@1.0.0'],
      },
      importers: {
        'comps/comp1': {
          dependencies: {
            comp2: {
              version: '1.0.0',
              specifier: '1.0.0',
            },
            foo: {
              version: '1.0.0(patch_hash=0000)',
              specifier: '^1.0.0',
            },
            bar: {
              version: 'link:../bar',
              specifier: `link:${path.resolve('comps/bar')}`,
            },
            qar: {
              version: '1.1.0',
              specifier: '1.1.0',
            },
            zoo: {
              version: '1.1.0(qar@1.1.0)',
              specifier: '1.1.0',
            },
          },
          devDependencies: {},
          optionalDependencies: {},
        },
      },
      lockfileVersion: '9.0',
      snapshots: {
        'foo@1.0.0(patch_hash=0000)': {
          dependencies: {
            bar: '1.0.0',
          },
        },
        'bar@1.0.0': {},
        'qar@1.1.0': {},
        'comp2@1.0.0': {},
        'zoo@1.1.0(qar@1.1.0)': {
          dependencies: {
            qar: '1.1.0',
          },
        },
      },
      packages: {
        'comp2@1.0.0': {
          resolution: {
            integrity: '0000',
          },
        },
        'foo@1.0.0': {
          engines: {
            node: '>=8',
            npm: '>=6',
          },
          hasBin: true,
          os: ['darwin'],
          cpu: ['arm64'],
          resolution: {
            integrity: 'sha512-000',
          },
        },
        'bar@1.0.0': {
          resolution: {
            integrity: 'sha512-111',
          },
        },
        'qar@1.1.0': {
          resolution: {
            integrity: 'sha512-222',
          },
        },
        'zoo@1.1.0': {
          peerDependencies: {
            qar: '*',
          },
          resolution: {
            integrity: 'sha512-333',
          },
        },
      },
    });
  });
});

describe('convertLockfileToGraph benchmark', () => {
  function generateLargeLockfile(
    numPackages: number,
    numComponents: number
  ): {
    lockfile: BitLockfileFile;
    componentIdByPkgName: Map<string, InstanceType<typeof ComponentID>>;
  } {
    const snapshots: Record<string, any> = {};
    const packages: Record<string, any> = {};
    const importerDeps: Record<string, any> = {};
    const componentIdByPkgName = new Map<string, InstanceType<typeof ComponentID>>();

    // Generate regular packages
    for (let i = 0; i < numPackages; i++) {
      const pkgId = `pkg-${i}@1.0.${i}`;
      packages[pkgId] = {
        resolution: { integrity: `sha512-${i}` },
      };
      // Each package depends on the next 2 packages (creating a graph)
      const deps: Record<string, string> = {};
      if (i + 1 < numPackages) deps[`pkg-${i + 1}`] = `1.0.${i + 1}`;
      if (i + 2 < numPackages) deps[`pkg-${i + 2}`] = `1.0.${i + 2}`;
      snapshots[pkgId] = Object.keys(deps).length > 0 ? { dependencies: deps } : {};
      if (i < 50) {
        importerDeps[`pkg-${i}`] = { version: `1.0.${i}`, specifier: `^1.0.${i}` };
      }
    }

    // Generate component packages (with file: protocol)
    for (let i = 0; i < numComponents; i++) {
      const compName = `@my-scope/comp-${i}`;
      const compPath = `comps/comp-${i}`;
      const fileDepPath = `${compName}@file:${compPath}`;

      packages[fileDepPath] = {
        resolution: { directory: compPath, type: 'directory' },
      };
      snapshots[fileDepPath] = {
        dependencies: {
          [`pkg-${i % numPackages}`]: `1.0.${i % numPackages}`,
        },
      };
      componentIdByPkgName.set(compName, ComponentID.fromString(`my-scope/comp-${i}@0.0.${i}`));
    }

    const lockfile: BitLockfileFile = {
      bit: { depsRequiringBuild: [] },
      importers: {
        '.': {},
        'node_modules/.bit_roots/env': {
          dependencies: Object.fromEntries(
            Array.from({ length: numComponents }, (_, i) => [
              `@my-scope/comp-${i}`,
              { version: `file:comps/comp-${i}`, specifier: '*' },
            ])
          ),
        },
        'comps/comp-0': {
          dependencies: importerDeps,
        },
      },
      lockfileVersion: '9.0',
      snapshots,
      packages,
    };

    return { lockfile, componentIdByPkgName };
  }

  it('should handle 1000 packages and 50 components within 500ms', () => {
    const { lockfile, componentIdByPkgName } = generateLargeLockfile(1000, 50);

    const start = performance.now();
    const graph = convertLockfileToGraph(lockfile, {
      pkgName: '@my-scope/comp-0',
      componentRelativeDir: 'comps/comp-0',
      componentRootDir: 'node_modules/.bit_roots/env',
      componentIdByPkgName,
    });
    const elapsed = performance.now() - start;

    expect(graph.edges.length).to.be.greaterThan(0);
    expect(graph.packages.size).to.be.greaterThan(0);
    expect(elapsed).to.be.lessThan(500);
  });

  it('should handle 5000 packages and 200 components within 2000ms', () => {
    const { lockfile, componentIdByPkgName } = generateLargeLockfile(5000, 200);

    const start = performance.now();
    const graph = convertLockfileToGraph(lockfile, {
      pkgName: '@my-scope/comp-0',
      componentRelativeDir: 'comps/comp-0',
      componentRootDir: 'node_modules/.bit_roots/env',
      componentIdByPkgName,
    });
    const elapsed = performance.now() - start;

    expect(graph.edges.length).to.be.greaterThan(0);
    expect(graph.packages.size).to.be.greaterThan(0);
    expect(elapsed).to.be.lessThan(2000);
  });

  it('should handle 10000 packages and 500 components within 5000ms', () => {
    const { lockfile, componentIdByPkgName } = generateLargeLockfile(10000, 500);

    const start = performance.now();
    const graph = convertLockfileToGraph(lockfile, {
      pkgName: '@my-scope/comp-0',
      componentRelativeDir: 'comps/comp-0',
      componentRootDir: 'node_modules/.bit_roots/env',
      componentIdByPkgName,
    });
    const elapsed = performance.now() - start;

    expect(graph.edges.length).to.be.greaterThan(0);
    expect(graph.packages.size).to.be.greaterThan(0);
    expect(elapsed).to.be.lessThan(5000);
  });

  it('should handle converting 20 lockfiles (1000 pkgs, 100 comps each) within 3000ms', () => {
    const lockfileCount = 20;
    const lockfiles = Array.from({ length: lockfileCount }, () => generateLargeLockfile(1000, 100));

    const start = performance.now();
    const graphs = lockfiles.map(({ lockfile, componentIdByPkgName }) =>
      convertLockfileToGraph(lockfile, {
        pkgName: '@my-scope/comp-0',
        componentRelativeDir: 'comps/comp-0',
        componentRootDir: 'node_modules/.bit_roots/env',
        componentIdByPkgName,
      })
    );
    const elapsed = performance.now() - start;

    for (const graph of graphs) {
      expect(graph.edges.length).to.be.greaterThan(0);
      expect(graph.packages.size).to.be.greaterThan(0);
    }
    expect(elapsed).to.be.lessThan(3000);
  });

  it('should handle converting 50 lockfiles (500 pkgs, 50 comps each) within 3000ms', () => {
    const lockfileCount = 50;
    const lockfiles = Array.from({ length: lockfileCount }, () => generateLargeLockfile(500, 50));

    const start = performance.now();
    const graphs = lockfiles.map(({ lockfile, componentIdByPkgName }) =>
      convertLockfileToGraph(lockfile, {
        pkgName: '@my-scope/comp-0',
        componentRelativeDir: 'comps/comp-0',
        componentRootDir: 'node_modules/.bit_roots/env',
        componentIdByPkgName,
      })
    );
    const elapsed = performance.now() - start;

    for (const graph of graphs) {
      expect(graph.edges.length).to.be.greaterThan(0);
      expect(graph.packages.size).to.be.greaterThan(0);
    }
    expect(elapsed).to.be.lessThan(3000);
  });
});

describe('convertGraphToLockfile on invalid graph', () => {
  it('should throw an error if resolution is missing', async () => {
    const packages: PackagesMap = new Map([['foo@1.0.0', {} as any]]);
    const edges: DependencyEdge[] = [
      {
        id: DependenciesGraph.ROOT_EDGE_ID,
        neighbours: [
          {
            id: 'foo@1.0.0',
            name: 'foo',
            specifier: '1.0.0',
            lifecycle: 'runtime',
          },
        ],
      },
      {
        id: 'foo@1.0.0',
        neighbours: [],
      },
    ];
    const graph = new DependenciesGraph({
      packages,
      edges,
    });
    let error: Error | undefined;
    try {
      await convertGraphToLockfile(new DependenciesGraph(graph), {
        manifests: {
          [path.resolve('comps/comp1')]: {
            dependencies: {
              foo: '1.0.0',
            },
          },
        },
        rootDir: process.cwd(),
        resolve: () => ({ resolution: {} }) as any,
      });
    } catch (_error) {
      error = _error as Error;
    }
    expect(error?.message).eq(
      `Failed to generate a valid lockfile. The "packages['foo@1.0.0'] entry doesn't have a "resolution" field.`
    );
  });
});
