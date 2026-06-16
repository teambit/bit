import { BitError } from '@teambit/bit-error';
import { errorSymbol, formatItem } from '@teambit/cli';

export type FailedUpdateDependent = {
  /** the failed update-dependent component id (without version) */
  id: string;
  /** the snap version (hash) that failed to build */
  version: string;
  /** workspace component ids that depend on this update-dependent */
  dependents: string[];
};

/**
 * thrown during `bit install` when a workspace component depends on a hidden "update-dependent"
 * of the current lane that was never published — its Ripple build failed or hasn't completed
 * successfully. without a published package there is nothing to install and pnpm would otherwise
 * fail with a cryptic "No matching version found" error.
 */
export class UpdateDependentBuildFailed extends BitError {
  constructor(readonly failed: FailedUpdateDependent[]) {
    super(UpdateDependentBuildFailed.formatMessage(failed));
  }

  private static formatMessage(failed: FailedUpdateDependent[]): string {
    const list = failed
      .map(({ id, version, dependents }) => {
        const shortVersion = version.substring(0, 9);
        const requiredBy = dependents.join(', ');
        return formatItem(`${id} (${shortVersion}) — required by: ${requiredBy}`, errorSymbol);
      })
      .join('\n');
    const importCommand = `bit import ${failed.map(({ id }) => id).join(' ')}`;
    return `unable to install the following update-dependent component(s) of the current lane.
their build did not complete successfully (it failed, e.g. on Ripple after "snap updates", or is still pending), so they were never published to the registry and no package exists to install:

${list}

to resolve, import the component(s) into your workspace so they are linked from source instead of fetched from the registry:

  ${importCommand}`;
  }
}
