import { SnapOptions } from './types';
import { Scope } from '../scope/scope.api';
import { Workspace } from '../workspace';
import GeneralError from '../error/general-error';
import { DEFAULT_BIT_RELEASE_TYPE } from '../constants';
import hasWildcard from '../utils/string/has-wildcard';

export default class Snap {
  constructor(
    /**
     * access to the `Workspace` instance
     */
    readonly workspace: Workspace,
    /**
     * access to the `Scope` instance
     */
    readonly scope: Scope
  ) {}

  snap({
    id,
    all,
    message,
    releaseType,
    exactVersion,
    force,
    verbose,
    ignoreMissingDependencies,
    ignoreUnresolvedDependencies,
    ignoreNewestVersion,
    skipTests,
    skipAutoTag,
    snapAllInScope
  }: SnapOptions) {
    if (!id && !all && !snapAllInScope) {
      throw new GeneralError('missing id. to tag all components, please use --all flag');
    }
    if (id && all) {
      throw new GeneralError(
        'you can use either a specific component [id] to tag a particular component or --all flag to tag them all'
      );
    }
    releaseType = releaseType || DEFAULT_BIT_RELEASE_TYPE;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const includeImported = snapAllInScope && all;
    if (ignoreMissingDependencies) ignoreUnresolvedDependencies = true;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const idHasWildcard = hasWildcard(id);

    // TODO:
    // Expose register func to enable stuff running before snap
    // Ask the workspace for a list of components
    //   in case of specific component ask for its instance and it's status
    //   in case of --all ask for modified / new / pending auto tag components
    //   in case of --scope ask for all components in workspace and scope
    //   workspace should go to the dep graph and get the list by it filtered by status / name etc'.
    // throw an error about missing components from scope (need to import first)
    // Check for missing deps and throw error about it (unless used with ignoreUnresolvedDependencies / ignoreMissingDependencies)
    // Check for newest version of comps and throw error about it unless used with ignoreNewestVersion
    // Pass the component/s and releaseType and exact version to some version extension
    //   version validation (validate it's a valid semver if exact version was provided)
    //   get the next version according to head and releaseType
    // Add the extension config (need to think how) (maybe the extension loader extension is also registered to tag hook)
    // Run pipes / build / test (should happen automatically by the pipes extension registered here)
    // Persist components using the scope.api
    // Update the bitmap using a workspace api with the persist results

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const params = {
      message,
      exactVersion, // TODO: Take an exact version from another extension by the comp and releaseType
      releaseType,
      force,
      verbose,
      ignoreUnresolvedDependencies,
      ignoreNewestVersion,
      skipTests,
      skipAutoTag
    };

    // if (all || scope || idHasWildcard) {
    //   return tagAllAction({
    //     ...params,
    //     scope,
    //     // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    //     includeImported,
    //     idWithWildcard: id
    //   });
    // }
    // return tagAction({
    //   ...params,
    //   id
    // });
  }
}
