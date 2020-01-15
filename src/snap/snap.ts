import { SnapOptions } from './types';
import { Scope } from '../scope/scope.api';
import { Workspace } from 'workspace';
import { BitId as ComponentId } from 'bit-id';
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
    console.log('im snapping a component');

    if (!id && !all && !snapAllInScope) {
      throw new GeneralError('missing id. to tag all components, please use --all flag');
    }
    if (id && all) {
      throw new GeneralError(
        'you can use either a specific component [id] to tag a particular component or --all flag to tag them all'
      );
    }
    releaseType = releaseType || DEFAULT_BIT_RELEASE_TYPE;
    const includeImported = snapAllInScope && all;
    if (ignoreMissingDependencies) ignoreUnresolvedDependencies = true;
    const idHasWildcard = hasWildcard(id);

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

    if (all || scope || idHasWildcard) {
      return tagAllAction({
        ...params,
        scope,
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        includeImported,
        idWithWildcard: id
      });
    }
    return tagAction({
      ...params,
      id
    });
  }
}
