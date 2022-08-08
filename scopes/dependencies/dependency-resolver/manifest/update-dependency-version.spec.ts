import { updateDependencyVersion } from './update-dependency-version';
import { DependencyLifecycleType } from '../dependencies';

describe('updateDependencyVersion()', function () {
  it('should pick version from root policy, when no variation policy is present', function () {
    const dependency = {
      getPackageName: () => 'foo',
      lifecycle: 'dev',
      version: '1.0.0',
      // @ts-ignore
      setVersion: jest.fn(),
    } as any; // eslint-disable-line
    const rootPolicy = {
      // @ts-ignore
      getValidSemverDepVersion: jest.fn((pkgName: string, lifecycle: DependencyLifecycleType) =>
        lifecycle === 'runtime' ? '2.0.0' : undefined
      ),
    } as any; // eslint-disable-line
    const variationPolicy = {
      getDepVersion: () => undefined,
    } as any; // eslint-disable-line
    updateDependencyVersion(dependency, rootPolicy, variationPolicy);
    // The lifecycle type is changed to runtime
    // root policies don't have a separate property for dev dependencies
    // both runtime and dev dependencies are specified through "dependencies"
    expect(rootPolicy.getValidSemverDepVersion).toHaveBeenCalledWith('foo', 'runtime');
    expect(dependency.setVersion).toHaveBeenCalledWith('2.0.0');
  });
});
