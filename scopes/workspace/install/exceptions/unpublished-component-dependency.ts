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
 * thrown during `bit install` when a checked-out workspace component depends on another component that
 * isn't checked out and is pinned to a snap that was never published to the registry, so the package
 * manager can't find it. the usual cause is a build that failed or hasn't completed yet (e.g. a hidden
 * lane "update-dependent" re-snapped by "snap updates"), but the message stays generic on purpose since
 * the snap may no longer be tracked as an update-dependent (e.g. after the lane was forked).
 */
export class UnpublishedComponentDependency extends BitError {
  constructor(readonly unpublished: UnpublishedSnapDependency[]) {
    super(UnpublishedComponentDependency.formatMessage(unpublished));
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
    return `unable to install the following component(s) — they're not checked out in your workspace and are pinned to a snap that was never published to the registry, so there's no package to fetch and no source to link:

${list}

this usually means the component's build failed or hasn't completed yet.
to resolve, import it into your workspace so it's linked from source instead of fetched from the registry:

  ${importCommand}`;
  }
}
