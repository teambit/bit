import { type LockfileFileV9 } from '@pnpm/lockfile.types';
import { convertLockfileToGraph, convertGraphToLockfile } from './lockfile-converter';
import { expect } from 'chai';

describe('convertLockfileToGraph simple case', () => {
  const lockfile: LockfileFileV9 = {
    lockfileVersion: '9.0',
    snapshots: {
      'foo@1.0.0': {
        dependencies: {
          bar: '1.0.0',
        },
      },
      'bar@1.0.0': {},
    },
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
    },
  };
  const graph = convertLockfileToGraph(lockfile);
  const expected = {
    edges: [
      {
        id: 'foo@1.0.0',
        neighbours: [{ id: 'bar@1.0.0', type: 'prod' }],
        attr: {
          pkgId: 'foo@1.0.0',
        },
      },
      {
        id: 'bar@1.0.0',
        neighbours: [],
        attr: {
          pkgId: 'bar@1.0.0',
        },
      },
    ],
    nodes: [
      {
        pkgId: 'foo@1.0.0',
        attr: {
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
      },
      {
        pkgId: 'bar@1.0.0',
        attr: {
          resolution: {
            integrity: 'sha512-111',
          },
        },
      },
    ],
  };
  it('should convert the lockfile object to the graph object', () => {
    expect(graph).to.eql(expected);
  });
  it('should convert the graph object to the lockfile object', () => {
    expect(
      convertGraphToLockfile({
        ...graph,
        directDependencies: [],
        schemaVersion: '1.0.0',
      })
    ).to.eql(lockfile);
  });
});
