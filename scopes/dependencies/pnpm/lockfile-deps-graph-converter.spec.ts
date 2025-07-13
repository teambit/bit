import path from 'path';
import { ComponentID } from '@teambit/component';
import { DependenciesGraph } from '@teambit/objects';
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
        },
      },
    },
    packages: {
      'comp1@file:comps/comp1': {
        resolution: {
          directory: 'comps/comp1',
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
    componentIdByPkgName: new Map([['comp1', ComponentID.fromString('my-scope/comp1@1.0.0')]]),
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
        id: 'comp1@1.0.0',
        neighbours: [
          {
            id: 'foo@1.0.0(patch_hash=0000)',
            optional: false,
          },
          {
            id: 'qar@1.1.0',
            optional: false,
          },
          {
            id: 'zoo@1.1.0(qar@1.1.0)',
            optional: false,
          },
        ],
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
      'comp1@1.0.0': {
        component: {
          name: 'comp1',
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
            },
          },
          rootDir: process.cwd(),
          resolve: () => ({ resolution: { integrity: '0000' } }) as any,
        },
      })
    ).to.eql({
      bit: {
        depsRequiringBuild: ['bar@1.0.0'],
      },
      importers: {
        'comps/comp1': {
          dependencies: {
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
        'comp1@1.0.0': {
          dependencies: {
            foo: '1.0.0(patch_hash=0000)',
            qar: '1.1.0',
            zoo: '1.1.0(qar@1.1.0)',
          },
        },
        'zoo@1.1.0(qar@1.1.0)': {
          dependencies: {
            qar: '1.1.0',
          },
        },
      },
      packages: {
        'comp1@1.0.0': {
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
