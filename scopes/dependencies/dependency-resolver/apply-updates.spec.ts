import { applyUpdates } from './apply-updates';

describe('applyUpdates()', () => {
  it('should apply updates on root dependencies', () => {
    const { updatedWorkspacePolicyEntries } = applyUpdates(
      [
        {
          name: 'lodash',
          latestRange: '2.0.0',
          source: 'rootPolicy',
          targetField: 'dependencies' as const,
        },
        {
          name: 'react-dom',
          latestRange: '2.0.0',
          source: 'rootPolicy',
          targetField: 'peerDependencies' as const,
        },
      ],
      {
        variantPoliciesByPatterns: {},
        componentPoliciesById: {},
      }
    );
    expect(updatedWorkspacePolicyEntries).toStrictEqual(
      [
        {
          dependencyId: 'lodash',
          value: {
            version: '2.0.0',
          },
          lifecycleType: 'runtime',
        },
        {
          dependencyId: 'react-dom',
          value: {
            version: '2.0.0',
          },
          lifecycleType: 'peer',
        },
      ],
      // @ts-ignore
      { updateExisting: true }
    );
  });
  it('should apply updates on variant dependencies', () => {
    const variantPoliciesByPatterns = {
      variant1: {
        dependencies: {
          'variant1-runtime-dep1': { version: '1.0.0', resolveFromEnv: true },
          'variant1-runtime-dep2': '1.0.0',
        },
        devDependencies: {
          'variant1-dev-dep1': '1.0.0',
          'variant1-dev-dep2': '1.0.0',
        },
        peerDependencies: {
          'variant1-peer-dep1': '1.0.0',
          'variant1-peer-dep2': '1.0.0',
        },
      },
      variant2: {
        dependencies: {
          'variant2-runtime-dep1': '1.0.0',
          'variant2-runtime-dep2': '1.0.0',
        },
        devDependencies: {
          'variant2-dev-dep1': '1.0.0',
          'variant2-dev-dep2': '1.0.0',
        },
        peerDependencies: {
          'variant2-peer-dep1': '1.0.0',
          'variant2-peer-dep2': '1.0.0',
        },
      },
      variant3: {
        dependencies: {
          'variant3-runtime-dep1': '1.0.0',
          'variant3-runtime-dep2': '1.0.0',
        },
        devDependencies: {
          'variant3-dev-dep1': '1.0.0',
          'variant3-dev-dep2': '1.0.0',
        },
        peerDependencies: {
          'variant3-peer-dep1': '1.0.0',
          'variant3-peer-dep2': '1.0.0',
        },
      },
    };
    applyUpdates(
      [
        {
          name: 'variant1-runtime-dep1',
          latestRange: '2.0.0',
          source: 'variants',
          variantPattern: 'variant1',
          targetField: 'dependencies',
        },
        {
          name: 'variant2-dev-dep1',
          latestRange: '2.0.0',
          source: 'variants',
          variantPattern: 'variant2',
          targetField: 'devDependencies',
        },
        {
          name: 'variant3-peer-dep1',
          latestRange: '2.0.0',
          source: 'variants',
          variantPattern: 'variant3',
          targetField: 'peerDependencies',
        },
      ],
      {
        variantPoliciesByPatterns,
        componentPoliciesById: {},
      }
    );
    // @ts-ignore
    expect(variantPoliciesByPatterns.variant1).toStrictEqual({
      dependencies: {
        'variant1-runtime-dep1': { version: '2.0.0', resolveFromEnv: true },
        'variant1-runtime-dep2': '1.0.0',
      },
      devDependencies: {
        'variant1-dev-dep1': '1.0.0',
        'variant1-dev-dep2': '1.0.0',
      },
      peerDependencies: {
        'variant1-peer-dep1': '1.0.0',
        'variant1-peer-dep2': '1.0.0',
      },
    });
    // @ts-ignore
    expect(variantPoliciesByPatterns.variant2).toStrictEqual({
      dependencies: {
        'variant2-runtime-dep1': '1.0.0',
        'variant2-runtime-dep2': '1.0.0',
      },
      devDependencies: {
        'variant2-dev-dep1': '2.0.0',
        'variant2-dev-dep2': '1.0.0',
      },
      peerDependencies: {
        'variant2-peer-dep1': '1.0.0',
        'variant2-peer-dep2': '1.0.0',
      },
    });
    // @ts-ignore
    expect(variantPoliciesByPatterns.variant3).toStrictEqual({
      dependencies: {
        'variant3-runtime-dep1': '1.0.0',
        'variant3-runtime-dep2': '1.0.0',
      },
      devDependencies: {
        'variant3-dev-dep1': '1.0.0',
        'variant3-dev-dep2': '1.0.0',
      },
      peerDependencies: {
        'variant3-peer-dep1': '2.0.0',
        'variant3-peer-dep2': '1.0.0',
      },
    });
  });
  it('should apply updates on component dependencies', () => {
    const componentPoliciesById = {
      component1: {
        dependencies: {
          'component1-runtime-dep1': { version: '1.0.0', resolveFromEnv: true },
          'component1-runtime-dep2': '1.0.0',
        },
        devDependencies: {
          'component1-dev-dep1': '1.0.0',
          'component1-dev-dep2': '1.0.0',
        },
        peerDependencies: {
          'component1-peer-dep1': '1.0.0',
          'component1-peer-dep2': '1.0.0',
        },
      },
    };
    applyUpdates(
      [
        {
          name: 'component1-runtime-dep1',
          latestRange: '2.0.0',
          source: 'component',
          componentId: 'component1',
          targetField: 'dependencies',
        },
        {
          name: 'component1-dev-dep1',
          latestRange: '2.0.0',
          source: 'component',
          componentId: 'component1',
          targetField: 'devDependencies',
        },
        {
          name: 'component1-peer-dep1',
          latestRange: '2.0.0',
          source: 'component',
          componentId: 'component1',
          targetField: 'peerDependencies',
        },
      ],
      {
        variantPoliciesByPatterns: {},
        componentPoliciesById,
      }
    );
    // @ts-ignore
    expect(componentPoliciesById).toStrictEqual({
      component1: {
        dependencies: {
          'component1-runtime-dep1': { version: '2.0.0', resolveFromEnv: true },
          'component1-runtime-dep2': '1.0.0',
        },
        devDependencies: {
          'component1-dev-dep1': '2.0.0',
          'component1-dev-dep2': '1.0.0',
        },
        peerDependencies: {
          'component1-peer-dep1': '2.0.0',
          'component1-peer-dep2': '1.0.0',
        },
      },
    });
  });
});
