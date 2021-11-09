import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import { getOutdatedWorkspacePkgs } from './get-outdated-workspace-pkgs';

describe('getOutdatedWorkspacePkgs()', () => {
  it('should return outdated dependencies', async () => {
    const outdatedPkgs = await getOutdatedWorkspacePkgs({
      rootPolicy: {
        entries: [
          {
            dependencyId: 'root-runtime-dep1',
            lifecycleType: 'runtime',
            value: {
              version: '1.0.0',
            },
          },
          {
            dependencyId: 'root-runtime-dep2',
            lifecycleType: 'runtime',
            value: {
              version: '1.0.0',
            },
          },
          {
            dependencyId: 'root-peer-dep1',
            lifecycleType: 'peer',
            value: {
              version: '1.0.0',
            },
          },
          {
            dependencyId: 'root-peer-dep2',
            lifecycleType: 'peer',
            value: {
              version: '1.0.0',
            },
          },
        ],
      } as any,
      variantPatterns: {
        '{variant1/*}': {
          [DependencyResolverAspect.id]: {
            policy: {
              dependencies: {
                'variant1-runtime-dep1': '1.0.0',
                'variant1-runtime-dep2': '1.0.0',
                'variant1-runtime-dep3': '-',
              },
              devDependencies: {
                'variant1-dev-dep1': '1.0.0',
                'variant1-dev-dep2': '1.0.0',
                'variant1-dev-dep3': '-',
              },
              peerDependencies: {
                'variant1-peer-dep1': '1.0.0',
                'variant1-peer-dep2': '1.0.0',
                'variant1-peer-dep3': '-',
              },
            },
          },
        },
      },
      // @ts-ignore
      resolve: jest.fn(
        (spec) =>
          ({
            'root-runtime-dep1@latest': '2.0.0',
            'root-peer-dep1@latest': '2.0.0',
            'variant1-runtime-dep1@latest': '2.0.0',
            'variant1-runtime-dep3@latest': '2.0.0',
            'variant1-dev-dep1@latest': '2.0.0',
            'variant1-dev-dep3@latest': '2.0.0',
            'variant1-peer-dep1@latest': '2.0.0',
            'variant1-peer-dep3@latest': '2.0.0',
            'component1-runtime-dep1@latest': '2.0.0',
            'component1-runtime-dep3@latest': '2.0.0',
            'component1-dev-dep1@latest': '2.0.0',
            'component1-dev-dep3@latest': '2.0.0',
            'component1-peer-dep1@latest': '2.0.0',
            'component1-peer-dep3@latest': '2.0.0',
          }[spec])
      ),
      componentPoliciesById: {
        component1: {
          dependencies: {
            'component1-runtime-dep1': '1.0.0',
            'component1-runtime-dep2': '1.0.0',
            'component1-runtime-dep3': '-',
          },
          devDependencies: {
            'component1-dev-dep1': '1.0.0',
            'component1-dev-dep2': '1.0.0',
            'component1-dev-dep3': '-',
          },
          peerDependencies: {
            'component1-peer-dep1': '1.0.0',
            'component1-peer-dep2': '1.0.0',
            'component1-peer-dep3': '-',
          },
        },
      },
    });
    // @ts-ignore
    expect(outdatedPkgs).toStrictEqual([
      {
        currentRange: '1.0.0',
        latestRange: '2.0.0',
        name: 'root-runtime-dep1',
        source: 'rootPolicy',
        variantPattern: null,
        targetField: 'dependencies',
      },
      {
        currentRange: '1.0.0',
        latestRange: '2.0.0',
        name: 'root-peer-dep1',
        source: 'rootPolicy',
        variantPattern: null,
        targetField: 'peerDependencies',
      },
      {
        currentRange: '1.0.0',
        latestRange: '2.0.0',
        name: 'variant1-runtime-dep1',
        source: 'variants',
        variantPattern: '{variant1/*}',
        targetField: 'dependencies',
      },
      {
        currentRange: '1.0.0',
        latestRange: '2.0.0',
        name: 'variant1-dev-dep1',
        source: 'variants',
        variantPattern: '{variant1/*}',
        targetField: 'devDependencies',
      },
      {
        currentRange: '1.0.0',
        latestRange: '2.0.0',
        name: 'variant1-peer-dep1',
        source: 'variants',
        variantPattern: '{variant1/*}',
        targetField: 'peerDependencies',
      },
      {
        currentRange: '1.0.0',
        latestRange: '2.0.0',
        name: 'component1-runtime-dep1',
        source: 'component',
        componentId: 'component1',
        targetField: 'dependencies',
      },
      {
        currentRange: '1.0.0',
        latestRange: '2.0.0',
        name: 'component1-dev-dep1',
        source: 'component',
        componentId: 'component1',
        targetField: 'devDependencies',
      },
      {
        currentRange: '1.0.0',
        latestRange: '2.0.0',
        name: 'component1-peer-dep1',
        source: 'component',
        componentId: 'component1',
        targetField: 'peerDependencies',
      },
    ]);
  });
});
