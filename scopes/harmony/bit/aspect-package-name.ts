import { getCoreAspectPackageName, getNonCorePackageName } from '@teambit/aspect-loader';
import { isLegacyCoreEnv } from '@teambit/envs';
import { isCoreAspect } from './manifests';

/**
 * the package name an aspect is published under.
 *
 * bit's own aspects are published as `@teambit/<name>` ('teambit.react/react' => '@teambit/react'),
 * while any other component is published under its component package name ('teambit.react/react'
 * => '@teambit/react.react'). the envs that used to be core aspects are the awkward case: they are
 * not core aspects anymore, yet every published version of them carries the core-aspects name -
 * they were core when those versions were published - so they keep resolving as core here.
 *
 * prefer this over deriving the name from the id: the convention has changed once and the answer
 * for a given id can change with it, so a copy of the rule elsewhere silently goes stale.
 *
 * the non-core conversion is naive (no component is loaded), so an aspect published with a custom
 * package name is not covered.
 */
export function getAspectPackageName(id: string): string {
  const idWithoutVersion = id.split('@')[0];
  if (isCoreAspect(idWithoutVersion) || isLegacyCoreEnv(idWithoutVersion)) {
    return getCoreAspectPackageName(idWithoutVersion);
  }
  return getNonCorePackageName(idWithoutVersion);
}
