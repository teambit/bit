import { BitError } from '@teambit/bit-error';
import { errorSymbol, formatItem } from '@teambit/cli';

export type UnpublishedSnapDependency = {
  /** the depended-on component id (without version) */
  id: string;
  /** the snap version (hash) that has no published package */
  version: string;
  /** workspace component ids that depend on it */
  dependents: string[];
};

/**
 * thrown during `bit install` when a workspace component depends on another component pinned to a snap
 * that was never published to the registry, so the package manager can't find it. the usual cause is a
 * hidden lane "update-dependent" (created by "snap updates") whose build failed or hasn't completed, but
 * it can also be any snap dependency that isn't checked out and was never published.
 */
export class UpdateDependentBuildFailed extends BitError {
  constructor(readonly unpublished: UnpublishedSnapDependency[]) {
    super(UpdateDependentBuildFailed.formatMessage(unpublished));
  }

  private static formatMessage(unpublished: UnpublishedSnapDependency[]): string {
    const list = unpublished
      .map(({ id, version, dependents }) => {
        const shortVersion = version.substring(0, 9);
        const requiredBy = dependents.join(', ');
        return formatItem(`${id} (${shortVersion}) required by: ${requiredBy}`, errorSymbol);
      })
      .join('\n');
    const importCommand = `bit import ${unpublished.map(({ id }) => id).join(' ')}`;
    return `unable to install the following component(s) — they are pinned to a snap that was never published to the registry, so there is no package to install:

${list}

this usually happens with a lane "update-dependent" (created by "snap updates") whose build failed or hasn't completed.
to resolve, import the component(s) into your workspace so they are linked from source instead of fetched from the registry:

  ${importCommand}`;
  }
}
