import Lane from './lane';
import ModelComponent from './model-component';
import ScopeMeta from './scopeMeta';
import Source from './source';
import Symlink from './symlink';
import Version from './version';
import ExportMetadata from './export-metadata';
import VersionHistory from './version-history';
import { LaneHistory } from './lane-history';

export { ModelComponent, ScopeMeta, Source, Version, Symlink, Lane, ExportMetadata, VersionHistory, LaneHistory };

import { registerRustSnapshotModels } from '../objects/rust-snapshot';
registerRustSnapshotModels({
  ModelComponent,
  ScopeMeta,
  Source,
  Version,
  Symlink,
  Lane,
  ExportMetadata,
  VersionHistory,
  LaneHistory,
});

import { registerRustHistoryVersion } from '../objects/rust-merge-history';
registerRustHistoryVersion(Version);

import { registerRustLaneSnapshotModels } from '../objects/rust-lane-snapshot';
registerRustLaneSnapshotModels({ ModelComponent, Version, Lane });

import { registerRustSquashModels } from '../objects/rust-squash-history';
registerRustSquashModels({ ModelComponent, Version, VersionHistory, Source });

import { registerRustResetClass } from '../objects/rust-reset-refs';
import { DetachedHeads } from './detach-heads';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { BitId } from '@teambit/legacy-bit-id';
for (const [name, constructor] of Object.entries({
  ModelComponent,
  Version,
  Lane,
  DetachedHeads,
  ComponentID,
  BitId,
  Array,
})) {
  registerRustResetClass(name, constructor);
}

import { registerRustTransferClass } from '../objects/rust-transfer';
registerRustTransferClass('ModelComponent', ModelComponent, [
  'collectVersionsObjects',
  'getLocalTagsOrHashes',
  'getRef',
  'loadVersion',
]);
registerRustTransferClass('Version', Version, ['hash', 'refsWithOptions', 'getType']);

registerRustTransferClass('Array', Array, [
  'map',
  'filter',
  'flat',
  'includes',
  'slice',
  'every',
  'some',
  'flatMap',
  'find',
  'push',
  'forEach',
]);
import { registerRustSnapshotTransactionClass, registerRustSnapshotFunctions } from '../objects/rust-snapshot-guards';
import { LaneId } from '@teambit/lane-id';
import Ref from '../objects/ref';
import BitObject from '../objects/object';
for (const [name, constructor] of Object.entries({
  ModelComponent,
  Version,
  Lane,
  VersionHistory,
  LaneHistory,
  Source,
  ScopeMeta,
  DetachedHeads,
  ComponentID,
  BitId,
  LaneId,
  Ref,
  ComponentIdList,
  Array,
}))
  registerRustSnapshotTransactionClass(name, constructor);
registerRustSnapshotFunctions('SnapshotBitObject', BitObject, ['makeHash']);

export { canPlanRustSnapshotFutureVersions } from './model-component';
