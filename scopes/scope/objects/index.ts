export { resolveRustObjectImportExecutable } from './objects/rust-object-discovery';
export {
  ModelComponent,
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
export { DepEdge, DepEdgeType, SourceFileModel, Log, canCompareVersionNatively } from './models/version';
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

export { planRustSquash, readRustSquashMessages } from './objects/rust-squash-history';
export {
  advanceRustRecovery,
  requestRustRecovery,
  registerRustRecoveryScope,
  hasRustRecoveryScope,
} from './objects/rust-lane-recovery';
export type { RustRecoveryOperation } from './objects/rust-lane-recovery';

export { planRustResetRefs, registerRustResetClass, registerRustResetRepositoryHooks } from './objects/rust-reset-refs';

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
