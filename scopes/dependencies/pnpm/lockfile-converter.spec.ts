import path from 'path';
import { DependenciesGraph } from '@teambit/legacy/dist/scope/models/dependencies-graph';
import { type LockfileFileV9 } from '@pnpm/lockfile.types';
import { convertLockfileToGraph, convertGraphToLockfile } from './lockfile-converter';
import { expect } from 'chai';

describe('convertLockfileToGraph simple case', () => {
  const lockfile: LockfileFileV9 = {
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
      'comp1@file:comps/comp1': {
        dependencies: {
          foo: '1.0.0(patch_hash=0000)',
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
    },
  };
  const graph = convertLockfileToGraph(lockfile, {
    pkgName: 'comp1',
    componentRelativeDir: 'comps/comp1',
    componentRootDir: 'node_modules/.bit_roots/env',
    componentIdByPkgName: new Map(),
  });
  const expected = {
    schemaVersion: '1.0',
    edges: [
      {
        id: 'foo@1.0.0(patch_hash=0000)',
        neighbours: [{ id: 'bar@1.0.0', optional: false }],
        attr: {
          pkgId: 'foo@1.0.0',
        },
      },
      {
        id: 'comp1@pending:',
        neighbours: [
          {
            id: 'foo@1.0.0(patch_hash=0000)',
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
        resolution: {
          integrity: 'sha512-111',
        },
      },
      'comp1@pending:': {
        resolution: {
          directory: 'comps/comp1',
          type: 'directory',
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
  it('should convert the graph object to the lockfile object', () => {
    expect(
      convertGraphToLockfile(
        new DependenciesGraph(graph),
        {
          [path.resolve('comps/comp1')]: {
            dependencies: {
              foo: '^1.0.0',
            },
          },
        },
        process.cwd()
      )
    ).to.eql({
      importers: {
        'comps/comp1': {
          dependencies: {
            foo: {
              version: '1.0.0(patch_hash=0000)',
              specifier: '^1.0.0',
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
        'comp1@pending:': {
          dependencies: {
            foo: '1.0.0(patch_hash=0000)',
          },
        },
      },
      packages: {
        'comp1@pending:': {
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
      },
    });
  });
});
