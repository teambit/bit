import assert from 'node:assert/strict';
import { DependenciesGraph } from '@teambit/objects';
import { componentDependenciesFromGraph } from './version-maker';

describe('component dependencies from package-manager graph', () => {
  it('promotes direct workspace edges to exact Bit component dependencies', () => {
    const snap = '718edcdf807d9b1c13850009711f0aabec7d2897';
    const componentPackageId = `@pnpm-vcs-example/math@0.0.0-${snap}`;
    const graph = new DependenciesGraph({
      packages: new Map([
        [
          componentPackageId,
          {
            component: { scope: 'pnpm.dogfood', name: 'pnpm-vcs-example/math' },
            version: `0.0.0-${snap}`,
          } as any,
        ],
        ['lodash@4.17.21', { version: '4.17.21' } as any],
      ]),
      edges: [
        {
          id: DependenciesGraph.ROOT_EDGE_ID,
          neighbours: [
            {
              name: '@pnpm-vcs-example/math',
              specifier: 'workspace:*',
              id: componentPackageId,
              lifecycle: 'runtime',
            },
            {
              name: 'lodash',
              specifier: '^4.17.21',
              id: 'lodash@4.17.21',
              lifecycle: 'runtime',
            },
          ],
        },
      ],
    });

    const dependencies = componentDependenciesFromGraph(graph);

    assert.equal(dependencies.length, 1);
    assert.equal(dependencies[0].id.toString(), `pnpm.dogfood/pnpm-vcs-example/math@${snap}`);
    assert.deepEqual(
      {
        packageName: dependencies[0].packageName,
        lifecycle: dependencies[0].lifecycle,
        optional: dependencies[0].optional,
      },
      {
        packageName: '@pnpm-vcs-example/math',
        lifecycle: 'runtime',
        optional: false,
      }
    );
  });

  it('preserves dev and optional metadata', () => {
    const componentPackageId = '@acme/test-utils@1.2.3';
    const graph = new DependenciesGraph({
      packages: new Map([
        [
          componentPackageId,
          {
            component: { scope: 'acme.scope', name: 'test-utils' },
            version: '1.2.3',
          } as any,
        ],
      ]),
      edges: [
        {
          id: DependenciesGraph.ROOT_EDGE_ID,
          neighbours: [
            {
              name: '@acme/test-utils',
              id: componentPackageId,
              lifecycle: 'dev',
              optional: true,
            },
          ],
        },
      ],
    });

    const dependency = componentDependenciesFromGraph(graph)[0];
    assert.equal(dependency.lifecycle, 'dev');
    assert.equal(dependency.optional, true);
  });

  it('does not mistake a prerelease tag for a snap package version', () => {
    const componentPackageId = '@acme/test-utils@0.0.0-alpha.1';
    const graph = new DependenciesGraph({
      packages: new Map([
        [
          componentPackageId,
          {
            component: { scope: 'acme.scope', name: 'test-utils' },
            version: '0.0.0-alpha.1',
          } as any,
        ],
      ]),
      edges: [
        {
          id: DependenciesGraph.ROOT_EDGE_ID,
          neighbours: [{ name: '@acme/test-utils', id: componentPackageId, lifecycle: 'runtime' }],
        },
      ],
    });

    assert.equal(componentDependenciesFromGraph(graph)[0].id.version, '0.0.0-alpha.1');
  });
});
