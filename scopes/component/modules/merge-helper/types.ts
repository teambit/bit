import type { ComponentID, ComponentIdList } from '@teambit/component-id';
import type { FileStatus } from './merge-version';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import type { AutoTagResult } from '@teambit/workspace';
import type { WorkspacePolicyConfigKeysNames } from '@teambit/dependency-resolver';

export type FailedComponents = { id: ComponentID; unchangedMessage: string; unchangedLegitimately?: boolean };

// fileName is PathLinux. TS doesn't let anything else in the keys other than string and number
export type FilesStatus = { [fileName: string]: keyof typeof FileStatus };

export type MergeSnapResults = {
  snappedComponents: ConsumerComponent[];
  autoSnappedResults: AutoTagResult[];
  removedComponents?: ComponentIdList;
  exportedIds?: ComponentID[];
} | null;

export type ApplyVersionResult = { id: ComponentID; filesStatus: FilesStatus };

export type ApplyVersionResults = {
  components?: ApplyVersionResult[];
  version?: string;
  failedComponents?: FailedComponents[];
  removedComponents?: ComponentID[];
  addedComponents?: ComponentID[]; // relevant when restoreMissingComponents is true (e.g. bit lane merge-abort)
  newComponents?: ComponentID[]; // relevant for "bit stash load". (stashedBitmapEntries is populated)
  resolvedComponents?: ConsumerComponent[]; // relevant for bit merge --resolve
  abortedComponents?: ApplyVersionResult[]; // relevant for bit merge --abort
  mergeSnapResults?: MergeSnapResults;
  mergeSnapError?: Error;
  leftUnresolvedConflicts?: boolean;
  verbose?: boolean;
  newFromLane?: string[];
  newFromLaneAdded?: boolean;
  installationError?: Error; // in case the package manager failed, it won't throw, instead, it'll return error here
  compilationError?: Error; // in case the compiler failed, it won't throw, instead, it'll return error here
  workspaceConfigUpdateResult?: WorkspaceConfigUpdateResult;
  gitBranchWarning?: string; // warning message when git branch creation fails
};

export type WorkspaceDepsUpdates = { [pkgName: string]: [string, string] }; // from => to
export type WorkspaceDepsConflicts = Record<WorkspacePolicyConfigKeysNames, Array<{ name: string; version: string }>>; // the pkg value is in a format of CONFLICT::OURS::THEIRS
export type WorkspaceDepsUnchanged = { [pkgName: string]: string }; // the pkg value is the message why it wasn't updated

export type WorkspaceConfigUpdateResult = {
  workspaceDepsUpdates?: WorkspaceDepsUpdates; // in case workspace.jsonc has been updated with dependencies versions
  workspaceDepsConflicts?: WorkspaceDepsConflicts; // in case workspace.jsonc has conflicts
  workspaceDepsUnchanged?: WorkspaceDepsUnchanged; // in case the deps in workspace.jsonc couldn't be updated
  workspaceConfigConflictWriteError?: Error; // in case workspace.jsonc has conflicts and we failed to write the conflicts to the file
  logs?: string[]; // verbose details about the updates/conflicts for each one of the deps
};
