import type { Component } from '@teambit/component';
import { Extensions } from '@teambit/legacy.constants';

export const PACK_LIFECYCLE_SCRIPTS = ['prepack', 'prepare', 'postpack'];
export const PUBLISH_LIFECYCLE_SCRIPTS = ['prepublishOnly', 'prepublish', 'publish', 'postpublish'];

/**
 * whether the package.json of any of the components needs the packages installed in the capsules, because it runs
 * any of the given lifecycle scripts or it bundles dependencies (taken from node_modules).
 * the package.json written to the capsule comes from the pkg config, the component overrides and, when the
 * artifacts are reused, the package.json of the last build (which includes the env transformations).
 */
export function packageJsonRequiresInstallation(
  components: Component[],
  pkgAspectId: string,
  lifecycleScripts: string[]
): boolean {
  return components.some((component) => {
    const legacyComponent = component.state._consumer;
    const pkgJsonOfLastBuild = legacyComponent.extensions
      .findExtension(Extensions.builder)
      ?.data?.aspectsData?.find((aspectData) => aspectData.aspectId === pkgAspectId)?.data?.pkgJson;
    const pkgJsonSources: Array<Record<string, any> | undefined> = [
      component.state.aspects.get(pkgAspectId)?.data?.packageJsonModification,
      legacyComponent.overrides?.componentOverridesPackageJsonData,
      pkgJsonOfLastBuild,
    ];
    return pkgJsonSources.some(
      (pkgJson) =>
        lifecycleScripts.some((script) => pkgJson?.scripts?.[script]) ||
        hasBundledDependencies(pkgJson?.bundledDependencies) ||
        hasBundledDependencies(pkgJson?.bundleDependencies)
    );
  });
}

/**
 * the value is either a list of package names or `true` to bundle all of them.
 */
function hasBundledDependencies(bundledDependencies: unknown): boolean {
  return Array.isArray(bundledDependencies) ? bundledDependencies.length > 0 : Boolean(bundledDependencies);
}
