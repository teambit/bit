import ActionNotFound from './action-not-found';
import { BitIdCompIdError } from './bit-id-comp-id-err';
import ClientIdInUse from './client-id-in-use';
import ComponentNeedsUpdate from './component-needs-update';
import ComponentNotFound from './component-not-found';
import { DependenciesNotFound } from './dependencies-not-found';
import { ErrorFromRemote } from './error-from-remote';
import { ExportMissingVersions } from './export-missing-versions';
import HashNotFound from './hash-not-found';
import { LaneNotFound } from './lane-not-found';
import { UnexpectedPackageName } from './unexpected-package-name';
import InvalidIndexJson from './invalid-index-json';
import MergeConflict from './merge-conflict';
import MergeConflictOnRemote from './merge-conflict-on-remote';
import { MissingObjects, HashesPerRemotes } from './missing-objects';
import { NoHeadNoVersion } from './no-head-no-version';
import OutdatedIndexJson from './outdated-index-json';
import ScopeJsonNotFound from './scope-json-not-found';
import ScopeNotFound from './scope-not-found';
import VersionAlreadyExists from './version-already-exists';
import ServerIsBusy from './server-is-busy';
import { UnknownObjectType } from './unknown-object-type';
import { PersistFailed } from './persist-failed';
import VersionInvalid from './version-invalid';
// version-traversal errors live with the traversal; re-exported here for existing importers
import {
  HeadNotFound,
  NoCommonSnap,
  ParentNotFound,
  VersionNotFound,
  VersionNotFoundOnFS,
} from '@teambit/component.snap-distance';
// thrown by the dependency graph; re-exported here for existing importers
import { IdNotFoundInGraph } from '@teambit/legacy.dependency-graph';

export {
  ActionNotFound,
  BitIdCompIdError,
  ClientIdInUse,
  ComponentNeedsUpdate,
  ScopeNotFound,
  ScopeJsonNotFound,
  ComponentNotFound,
  DependenciesNotFound,
  ErrorFromRemote,
  ExportMissingVersions,
  HashNotFound,
  MergeConflict,
  MergeConflictOnRemote,
  MissingObjects,
  NoCommonSnap,
  NoHeadNoVersion,
  HashesPerRemotes,
  VersionNotFound,
  ParentNotFound,
  VersionAlreadyExists,
  IdNotFoundInGraph,
  LaneNotFound,
  UnexpectedPackageName,
  InvalidIndexJson,
  OutdatedIndexJson,
  HeadNotFound,
  VersionNotFoundOnFS,
  ServerIsBusy,
  UnknownObjectType,
  PersistFailed,
  VersionInvalid,
};
