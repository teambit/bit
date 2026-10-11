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
registerRustSquashModels({ ModelComponent, Version, VersionHistory });

import { registerRustResetClass } from '../objects/rust-reset-refs';
import { DetachedHeads } from './detach-heads';
import { ComponentID } from '@teambit/component-id';
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
