import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import { ExtensionDataList, ExtensionDataEntry } from '@teambit/legacy.extension-data';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import { getPlusRangeVersionsUsage, throwForPlusRangeVersions } from './plus-range-versions';

function createComponent({
  depVersionRange,
  policyVersion,
  envJsonc,
}: {
  depVersionRange?: string;
  policyVersion?: string;
  envJsonc?: Record<string, any>;
}): ConsumerComponent {
  const policy = policyVersion
    ? [{ dependencyId: 'my-pkg', lifecycleType: 'runtime', value: { version: policyVersion } }]
    : [];
  const extensions = new ExtensionDataList(
    new ExtensionDataEntry(undefined, undefined, DependencyResolverAspect.id, undefined, { policy })
  );
  const files = envJsonc ? [{ relative: 'env.jsonc', contents: Buffer.from(JSON.stringify(envJsonc)) }] : [];
  return {
    id: ComponentID.fromString('my-scope/my-comp@0.0.1'),
    getAllDependencies: () => [
      { id: ComponentID.fromString('my-scope/dep@0.0.1'), packageName: '@my-scope/dep', versionRange: depVersionRange },
    ],
    extensions,
    files,
  } as any;
}

describe('getPlusRangeVersionsUsage()', () => {
  it('should find a "+^" range of a dependency', () => {
    expect(getPlusRangeVersionsUsage(createComponent({ depVersionRange: '+^' }))).to.deep.equal([
      '@my-scope/dep: "+^"',
    ]);
  });
  it('should find a "+~" version in the policy', () => {
    expect(getPlusRangeVersionsUsage(createComponent({ policyVersion: '+~' }))).to.deep.equal(['my-pkg: "+~"']);
  });
  it('should find a "+^" supportedRange in the env.jsonc of an env', () => {
    const envJsonc = { policy: { peers: [{ name: 'my-pkg', version: '+', supportedRange: '+^' }] } };
    expect(getPlusRangeVersionsUsage(createComponent({ envJsonc }))).to.deep.equal([
      'env.jsonc policy.peers my-pkg: "+^"',
    ]);
  });
  it('should find a "+^" version in the legacy format of the env.jsonc policy', () => {
    const envJsonc = {
      policy: { peerDependencies: { 'my-pkg': '+^', 'other-pkg': { version: '+~' }, 'ok-pkg': '+' } },
    };
    expect(getPlusRangeVersionsUsage(createComponent({ envJsonc }))).to.deep.equal([
      'env.jsonc policy.peerDependencies my-pkg: "+^"',
      'env.jsonc policy.peerDependencies other-pkg: "+~"',
    ]);
  });
  it('should ignore "+" and regular versions', () => {
    const envJsonc = { policy: { peers: [{ name: 'my-pkg', version: '+', supportedRange: '^1.0.0' }] } };
    const component = createComponent({ depVersionRange: '+', policyVersion: '1.0.0', envJsonc });
    expect(getPlusRangeVersionsUsage(component)).to.deep.equal([]);
  });
});

describe('throwForPlusRangeVersions()', () => {
  it('should throw when the feature is not enabled', () => {
    expect(() => throwForPlusRangeVersions([createComponent({ depVersionRange: '+^' })])).to.throw(
      'plus-range-versions'
    );
  });
  it('should not throw when no "+^"/"+~" is used', () => {
    expect(() => throwForPlusRangeVersions([createComponent({ depVersionRange: '+' })])).to.not.throw();
  });
});
