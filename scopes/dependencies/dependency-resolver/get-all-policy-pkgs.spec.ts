import { getAllPolicyPkgs } from './get-all-policy-pkgs';
import { WorkspacePolicy } from './policy';

describe('getAllPolicyPkgs()', () => {
  it('should read the version from a version object', () => {
    const outdatedPkgs = getAllPolicyPkgs({
      rootPolicy: new WorkspacePolicy([]),
      variantPoliciesByPatterns: {
        comp: {
          dependencies: {
            foo: {
              version: '1',
              resolveFromEnv: true,
            },
          },
          devDependencies: {},
          peerDependencies: {},
        },
      },
      componentPoliciesById: {},
      componentModelVersions: [],
    });
    // @ts-ignore
    expect(outdatedPkgs).toStrictEqual([
      {
        currentRange: '1',
        name: 'foo',
        source: 'variants',
        targetField: 'dependencies',
        variantPattern: 'comp',
      },
    ]);
  });
  it('should deduplicate dependencies that are present in root policies', () => {
    const outdatedPkgs = getAllPolicyPkgs({
      rootPolicy: new WorkspacePolicy([
        {
          dependencyId: 'foo',
          lifecycleType: 'runtime',
          value: { version: '1' },
        },
      ]),
      variantPoliciesByPatterns: {},
      componentPoliciesById: {},
      componentModelVersions: [
        {
          name: 'foo',
          version: '2',
          lifecycleType: 'runtime',
          componentId: 'comp1',
        },
        {
          name: 'bar',
          version: '2',
          lifecycleType: 'runtime',
          componentId: 'comp1',
        },
      ],
    });
    // @ts-ignore
    expect(outdatedPkgs).toStrictEqual([
      {
        currentRange: '1',
        name: 'foo',
        source: 'rootPolicy',
        targetField: 'dependencies',
        variantPattern: null,
      },
      {
        componentId: 'comp1',
        currentRange: '2',
        name: 'bar',
        source: 'component-model',
        targetField: 'dependencies',
      },
    ]);
  });
});
