export { resolveRustObjectImportExecutable } from './objects/rust-object-discovery';
export {
  ModelComponent,
  canPlanRustSnapshotFutureVersions,
  ScopeMeta,
  Source,
  Version,
  Symlink,
  Lane,
  ExportMetadata,
  VersionHistory,
  LaneHistory,
} from './models';
export { BitObject, BitRawObject, Ref, Repository } from './objects';
export type { ObjectWithType, ObjectsWithType } from './objects';
export { ComponentLog, ScopeListItem, AddVersionOpts, ComponentProps, VERSION_ZERO } from './models/model-component';
export { ComponentItem, IndexType, LaneItem } from './objects/scope-index';
export { ObjectItem, ObjectList, ObjectItemsStream } from './objects/object-list';
export { BitObjectList } from './objects/bit-object-list';
export { LaneComponent, Log as LaneLog, LaneReadmeComponent } from './models/lane';
export {
  DependenciesGraph,
  type PackagesMap,
  type PackageAttributes,
  type DependencyEdge,
  type DependencyNeighbour,
} from './models/dependencies-graph';
export {
  DepEdge,
  DepEdgeType,
  SourceFileModel,
  Log,
  canCompareVersionNatively,
  hasDefaultInspectionVersionMethods,
} from './models/version';
export { compareRustInspectionVersions } from './objects/rust-inspection-model';
export { canHashSourceNatively } from './models/source';
export { ComponentWithCollectOptions, ObjectsReadableGenerator } from './objects/objects-readable-generator';
export { ScopeIndex } from './objects/scope-index';
export { NativeImportOperation, nativeIndices, nativeSelections } from './objects/rust-object-operation';
export { VersionHistoryGraph } from './models/version-history';
export { VersionParents, versionParentsToGraph } from './models/version-history';
export { HistoryItem } from './models/lane-history';
export { IdGraph, objectListToGraph, bitObjectListToGraph } from './objects/object-list-to-graph';

import { ObjectsAspect } from './objects.aspect';

export type { ObjectsMain } from './objects.main.runtime';
export default ObjectsAspect;
export { ObjectsAspect };

export { withRustSnapshotOperation, isRustSnapshotOperation, addRustSnapshotVersion } from './objects/rust-snapshot';

export { getRustDivergence } from './objects/rust-merge-history';

export { reconcileRustMergeSnapshot } from './objects/rust-lane-snapshot';
export {
  projectRustUnmergedIds,
  registerRustUnmergedComponents,
  transitionRustUnmergedState,
  persistRustUnmergedState,
} from './objects/rust-merge-state';

export { planRustSquash, readRustSquashMessages, canReadRustCheckoutRepository } from './objects/rust-squash-history';
export {
  advanceRustRecovery,
  requestRustRecovery,
  registerRustRecoveryScope,
  hasRustRecoveryScope,
} from './objects/rust-lane-recovery';
export type { RustRecoveryOperation } from './objects/rust-lane-recovery';

export {
  planRustResetRefs,
  withRustHistoryResetRefPlan,
  registerRustResetClass,
  registerRustResetRepositoryHooks,
  noteRustResetVersionId,
} from './objects/rust-reset-refs';

export {
  registerRustTransferClass,
  registerRustTransferRepositoryHooks,
  hasRustTransferClass,
  withRustTransferOperation,
  requestRustTransfer,
  collectRustTransferVersions,
  collectRustExportObjects,
  prepareRustTransferList,
  rustTransferObjectsHash,
  rustTransferTar,
} from './objects/rust-transfer';

export {
  registerRustSnapshotTransactionClass,
  hasRustSnapshotTransactionClass,
  hasRustSnapshotTransactionClassFields,
  hasRustSnapshotTransactionClassFieldsBatch,
  hasRustSnapshotTransactionClassConstructor,
  registerRustSnapshotModelHook,
  registerRustSnapshotValidationHook,
  hasRustSnapshotValidationHook,
  hasRustSnapshotModelHooks,
  registerRustSnapshotFunctions,
  hasRustSnapshotFunctions,
  hasRustSnapshotMethods,
  registerRustSnapshotFunctionReference,
  hasRustSnapshotFunctionReference,
} from './objects/rust-snapshot-guards';
export { projectRustSnapshotValue } from './objects/rust-snapshot-values';
export type { RustSnapshotValue } from './objects/rust-snapshot-values';
export {
  withRustSnapshotTransaction,
  requestRustSnapshotTransaction,
  runRustSnapshotPhases,
  isRustSnapshotTransaction,
  retireRustSnapshotTransaction,
  registerRustSnapshotTransactionCleanup,
} from './objects/rust-snapshot-transaction';
export type { SnapshotPhase } from './objects/rust-snapshot-transaction';
export { projectRustSnapshotFields } from './objects/rust-snapshot-projection';
export { RustSnapshotRepositoryJournal } from './objects/rust-snapshot-repository';

export {
  withRustHistoryQueryOperation,
  isRustHistoryQueryOperation,
  requestRustHistoryQuery,
  retireRustHistoryQueryOperation,
  registerRustHistoryQueryCleanup,
  canUseRustHistoryQueryRepository,
  captureRustHistoryQueryObjects,
  registerRustHistoryQueryRepositoryHooks,
  captureRustHistoryQuery,
  captureRustHistoryQueryVersion,
  captureRustHistoryQueryVersionGuard,
  retainRustHistoryQueryToken,
} from './objects/rust-history-query';
export { getRustHistoryQueryGraphOrder, getRustHistoryQueryHistoryGraph } from './objects/rust-history-query-graph';

export {
  planRustSnapshotFutureVersion,
  snapshotPolicySemver,
  snapshotPolicyId,
  snapshotPolicyConsumerId,
} from './objects/rust-snapshot-policy';

export {
  captureRustHistoryFileVersion,
  getRustHistoryFileLineage,
  getRustHistoryBlame,
  getRustHistoryFileDiff,
} from './objects/rust-history-query-files';
export type { HistoryFileCapture } from './objects/rust-history-query-files';

export {
  withRustMergeTransactionOperation,
  isRustMergeTransactionOperation,
  canRequestRustMergeTransaction,
  requestRustMergeTransaction,
  retireRustMergeTransaction,
  registerRustMergeTransactionCleanup,
  retainRustMergeTransactionToken,
} from './objects/rust-merge-transaction';
export {
  withRustMergeTransactionJournal,
  completeRustMergeTransactionPhase,
  getRustMergeTransactionToken,
  canUseRustMergeTransactionMode,
  beginRustMergeStatus,
  observeRustMergeStatus,
} from './objects/rust-merge-transaction';
export type {
  MergeTransactionPhase,
  MergeTransactionCursor,
  MergeStatusObservation,
  RustMergeStatusResult,
  RustMergeStatusCursor,
} from './objects/rust-merge-transaction';
export {
  registerRustMergeStatusProvider,
  canUseRustMergeStatusProvider,
  captureRustMergeStatusProvider,
  captureRustMergeDivergence,
} from './objects/rust-merge-transaction-guards';
export {
  canHydrateRustHistoryQuerySources,
  validRustHistorySourceReceipt,
  loadRustCapturedSourceCapsule,
} from './objects/rust-history-query-sources';
export type { HistorySourceCapsule } from './objects/rust-history-query-sources';

export { readRustBodyRange, readRustBodyRangeSync } from './objects/rust-body-range';
