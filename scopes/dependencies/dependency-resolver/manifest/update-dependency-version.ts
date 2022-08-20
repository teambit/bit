import { snapToSemver } from '@teambit/component-package-version';
import { Dependency } from '../dependencies';
import { VariantPolicy, WorkspacePolicy } from '../policy';

/**
 * This will create a function that will modify the version of the component dependencies before calling the package manager install
 * It's important for this use case:
 * between 2 bit components we are not allowing a range, only a specific version as dependency
 * therefor, when resolve a component dependency we take the version from the actual installed version in the file system
 * imagine the following case
 * I have in my policy my-dep:0.0.10
 * during installation it is installed (hoisted to the root)
 * now i'm changing it to be ^0.0.11
 * On the next bit install, when I will look at the component deps I'll see it with version 0.0.10 always (that's resolved from the FS)
 * so the version ^0.0.11 will be never installed.
 * For installation purpose we want a different resolve method, we want to take the version from the policies so we will install the correct one
 * this function will get the root deps / policy, and a function to merge the component policies (by the dep resolver extension).
 * it will then search for the dep version in the component policy, than in the workspace policy and take it from there
 * now in the described case, it will be change to ^0.0.11 and will be install correctly
 * then on the next calculation for tagging it will have the installed version
 *
 * @param {Component} component
 * @param {ManifestDependenciesObject} rootDependencies
 * @param {MergeDependenciesFunc} mergeDependenciesFunc
 * @returns {DepVersionModifierFunc}
 */
export function updateDependencyVersion(
  dependency: Dependency,
  rootPolicy: WorkspacePolicy,
  variantPolicy: VariantPolicy
): void {
  if (dependency.getPackageName) {
    const packageName = dependency.getPackageName();
    const variantVersion = variantPolicy.getDepVersion(packageName, dependency.lifecycle);
    const variantVersionWithoutMinus = variantVersion && variantVersion !== '-' ? variantVersion : undefined;
    const version =
      variantVersionWithoutMinus ||
      rootPolicy.getValidSemverDepVersion(packageName, dependency.lifecycle === 'peer' ? 'peer' : 'runtime') ||
      snapToSemver(dependency.version) ||
      '0.0.1-new';

    dependency.setVersion(version);
  }
}
