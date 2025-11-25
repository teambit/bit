import { expect } from 'chai';
import sinon from 'sinon';
import { updateDependencyVersion } from './update-dependency-version';
import type { DependencyLifecycleType } from '../dependencies';

describe('updateDependencyVersion()', function () {
  it('should pick version from root policy, when no variation policy is present', function () {
    const setVersionStub = sinon.stub();
    const getValidSemverDepVersionStub = sinon.stub();

    const dependency = {
      getPackageName: () => 'foo',
      lifecycle: 'dev',
      version: '1.0.0',
      setVersion: setVersionStub,
    } as any; // eslint-disable-line

    const rootPolicy = {
      getValidSemverDepVersion: getValidSemverDepVersionStub.callsFake(
        (pkgName: string, lifecycle: DependencyLifecycleType) => (lifecycle === 'runtime' ? '2.0.0' : undefined)
      ),
    } as any; // eslint-disable-line

    const variationPolicy = {
      getDepVersion: () => undefined,
    } as any; // eslint-disable-line

    updateDependencyVersion(dependency, rootPolicy, variationPolicy);

    // The lifecycle type is changed to runtime
    // root policies don't have a separate property for dev dependencies
    // both runtime and dev dependencies are specified through "dependencies"
    expect(getValidSemverDepVersionStub.calledWith('foo', 'runtime')).to.be.true;
    expect(setVersionStub.calledWith('2.0.0')).to.be.true;
  });
});
