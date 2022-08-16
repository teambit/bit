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
});
